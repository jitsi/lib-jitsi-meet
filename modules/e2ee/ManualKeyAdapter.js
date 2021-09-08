import Listenable from '../util/Listenable';
import { E2EEncryption } from './E2EEncryption';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

export class ManualKeyAdapter extends Listenable {
    constructor(conference) {
        super();

        this._conf = conference;
        this._key = undefined;
        this._keyIndex = -1;

        this._conf.on(JitsiConferenceEvents.USER_JOINED, this._onParticipantJoined.bind(this));
    }

    async initSessions() {
    }

    /**
     * Updates the current participant key and distributes it to all participants in the conference
     * by sending a key-info message.
     *
     * @param {Uint8Array|boolean} key - The new key.
     * @retrns {Promise<Number>}
     */
    async updateKey(key) {
        // Store it locally for new sessions.
        this._key = key;
        this._keyIndex++;

        for(const participant of this._conf.getParticipants()) {
            this.eventEmitter.emit(
                E2EEncryption.keyAdapterEvents.PARTICIPANT_KEY_UPDATED, 
                participant.getId(), 
                this._key, 
                this._keyIndex);
        }

        return this._keyIndex;
    }

    _onParticipantJoined(id) {
        this.eventEmitter.emit(
            E2EEncryption.keyAdapterEvents.PARTICIPANT_KEY_UPDATED, 
            id, 
            this._key, 
            this._keyIndex);
    }
}
