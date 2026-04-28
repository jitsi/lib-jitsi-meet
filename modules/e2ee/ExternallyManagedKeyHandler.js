import { getLogger } from '@jitsi/logger';

import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';

import { KeyHandler } from './KeyHandler';
import { OlmAdapter } from './OlmAdapter';

const logger = getLogger('e2ee:ExternallyManagedKeyHandler');

/**
 * This module integrates {@link E2EEContext} with an external key provider in order to set the
 * encryption keys used by the SFrame/JFrame transform pipeline.
 *
 * In contrast to {@link ManagedKeyHandler}, no Olm sessions are established; the caller is fully
 * responsible for generating, distributing, and rotating keys, and for delivering them to this
 * handler via {@link JitsiConference#setMediaEncryptionKey}.
 *
 * The handler supports two modes selected at construction time via the conference configuration:
 *
 * **Shared-key mode** (default, `e2ee.externallyManagedSharedKey !== false`):
 *   A single encryption context is shared across all participants.  The same key encrypts
 *   outgoing frames and decrypts all incoming frames regardless of sender.  This matches the
 *   original behaviour of the handler.
 *
 * **Per-sender mode** (`e2ee.externallyManagedSharedKey: false`):
 *   Each participant has an independent encryption context.  The caller supplies a
 *   `participantId` field when setting a key so that the worker can apply the correct key when
 *   decrypting frames from that participant.  When `participantId` is omitted the local
 *   participant's ID is used, which sets the key used for encoding outgoing frames.
 *
 * Per-sender mode enables asymmetric key distribution (each sender encrypts with their own
 * unique key) while still operating within the standard Jitsi SFU topology where the server
 * forwards a single encrypted stream per sender to all receivers.
 *
 * When OLM is available an {@link OlmAdapter} is created to provide an encrypted custom-message
 * channel between participants (used by the host-app for ML-KEM key exchange and HSM attestation).
 * The OLM channel is independent of media-key distribution; no keys are exchanged automatically.
 */
export class ExternallyManagedKeyHandler extends KeyHandler {
    /**
     * Build a new ExternallyManagedKeyHandler instance, which will be used in a given conference.
     *
     * @param conference - The current conference.
     */
    constructor(conference) {
        const { e2ee = {} } = conference.options.config;

        // Default to shared-key mode for backward compatibility.  Set
        // e2ee.externallyManagedSharedKey: false in the Jitsi config.js to enable per-sender mode.
        const sharedKey = e2ee.externallyManagedSharedKey !== false;

        super(conference, { sharedKey });

        if (OlmAdapter.isSupported()) {
            this._olmAdapter = new OlmAdapter(conference);

            this._olmAdapter.on(
                OlmAdapter.events.CUSTOM_MESSAGE_RECEIVED,
                (from, type, payload) => {
                    this.conference.eventEmitter.emit(
                        JitsiConferenceEvents.OLM_MESSAGE_RECEIVED, from, type, payload);
                });
        }
    }

    /**
     * Enables / disables E2EE.  When enabled, OLM sessions are established with
     * all other participants to provide the custom-message transport.
     *
     * @param {boolean} enabled
     */
    async _setEnabled(enabled) {
        if (!this._olmAdapter) {
            return;
        }

        if (enabled) {
            await this._olmAdapter.initSessions();
            logger.debug('OLM sessions established for custom-message transport');
        } else {
            this._olmAdapter.clearAllParticipantsSessions();
        }
    }

    /**
     * Sends an encrypted custom message to a participant (or all if participantId is falsy)
     * through the OLM E2EE channel.
     *
     * @param {string} participantId - Target participant ID, or '' / null for broadcast.
     * @param {string} type - Application-defined message type (e.g. 'encedo:kyber-pub').
     * @param {object} payload - Arbitrary JSON-serializable payload.
     */
    sendCustomMessage(participantId, type, payload) {
        if (!this._olmAdapter) {
            logger.warn('sendCustomMessage called but OLM is not available');

            return;
        }

        this._olmAdapter.sendCustomMessage(participantId, type, payload);
    }

    /**
     * Sets the encryption key and key index for a participant's E2EE context.
     *
     * @param {Uint8Array|ArrayBuffer|false} [keyInfo.encryptionKey] - Raw key material bytes fed
     *   into the HKDF-SHA-256 derivation pipeline inside the E2EE worker.  Pass {@code false} to
     *   disable encryption for this participant.
     * @param {number} [keyInfo.index] - Key ring slot index (0–15).  Rotating the index allows
     *   the receiver to continue decrypting in-flight frames encrypted under the old key.
     * @param {string} [keyInfo.participantId] - ID of the participant whose context is being
     *   updated.  When omitted the local participant's ID is used, which configures the key
     *   applied to outgoing (encoded) frames.  Required in per-sender mode when setting a remote
     *   participant's receive key.
     * @returns {void}
     */
    setKey(keyInfo) {
        // Fall back to the local participant ID so the worker always receives a valid,
        // non-empty participantId.  In shared-key mode the worker ignores this value and
        // routes all setKey calls to the single shared context; in per-sender mode it
        // selects the per-participant context for this sender.
        const participantId = keyInfo.participantId ?? this.conference.myUserId();

        this.e2eeCtx.setKey(participantId, keyInfo.encryptionKey, keyInfo.index);
    }
}
