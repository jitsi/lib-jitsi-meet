import Listenable from '../util/Listenable';
import { E2EEncryption } from './E2EEncryption';

export class ManualKeyAdapter extends Listenable {
    constructor(conference) {
        super();

        this._conf = conference;
        this._key = undefined;
        this._keyIndex = -1;

        this._conf.on(JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
            this._onParticipantPropertyChanged.bind(this));
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

      /**
    * Handles an update in a participant's presence property.
    *
    * @param {JitsiParticipant} participant - The participant.
    * @param {string} name - The name of the property that changed.
    * @param {*} oldValue - The property's previous value.
    * @param {*} newValue - The property's new value.
    * @private
    */
   async _onParticipantPropertyChanged(participant, name, oldValue, newValue) {
    switch (name) {
    case 'e2ee.enabled':
        if (newValue && this._conf.isE2EEEnabled()) {
            const participantFeatures = await participant.getFeatures();

            if (participantFeatures.has(FEATURE_E2EE)) {
                this.eventEmitter.emit(
                    E2EEncryption.keyAdapterEvents.PARTICIPANT_KEY_UPDATED, 
                    participant.getId(), 
                    this._key, 
                    this._keyIndex);
            }
        }
        break;
    }
}
}
