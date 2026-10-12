// Experimental platform adapter for Jitsi's fire-and-forget E2EEContext API.
// The bridge owns ONE native conference; its PCs have creation-time protection.
// No JS copy of the current key ring is kept or replayed into replacement PCs.
/** Own native conference state without retaining a JavaScript key ring. */
export default class NativeManagedKeyContext {
    bridge: any;
    onError: (error: Error) => void;
    closed: boolean;
    failure: Error;
    removed: Set<string>;
    snapshots: Set<Uint8Array>;
    pending: Promise<unknown>;
    closing: Promise<unknown>;

    /** Initialize owned state and validate the required platform dependencies. */
    constructor({
        bridge,
        onError
    }) {
        for (const method of [ 'setKey', 'removeParticipant', 'bindReceiver', 'verifySender', 'close' ]) {
            if (typeof bridge?.[method] !== 'function') {
                throw new Error('Incomplete managed E2EE bridge');
            }
        }
        if (typeof onError !== 'function') {
            throw new Error('Native E2EE requires an error observer');
        }
        this.bridge = bridge;
        this.onError = onError;
        this.closed = false;
        this.failure = null;
        this.removed = new Set();
        this.snapshots = new Set();
        this.pending = Promise.resolve();
        this.closing = Promise.resolve();
    }

    // Retain a handled queue AND return the original observable result. Jitsi's
    // existing handlers ignore the return value, so rejection must also reach the
    // conference owner without becoming an unhandled promise rejection.
    /** Serialize bridge operations while observing failures ignored by original handlers. */
    enqueue(operation, participant, snapshot?: Uint8Array) {
        if (snapshot) {
            this.snapshots.add(snapshot);
        }
        const result = this.pending.then(async () => {
            if (this.closed || this.removed.has(participant)) {
                return false;
            }
            try {
                const accepted = await operation();

                if (this.closed || this.removed.has(participant)) {
                    return false;
                }
                if (accepted === false) {
                    throw new Error('Native E2EE operation rejected');
                }

                return true;
            } catch (error) {
                if (this.closed || this.removed.has(participant)) {
                    return false;
                }
                throw error;
            }
        }).finally(() => {
            snapshot?.fill(0);
            this.snapshots.delete(snapshot);
        });

        this.pending = result.catch(error => this.fail(error));

        return result;
    }

    /** Terminally close the owner and notify the required error observer once. */
    fail(error) {
        if (this.failure) {
            return;
        }
        this.failure = new Error('Native managed E2EE failed');
        Object.defineProperty(this.failure, 'cause', { value: error });
        this.cleanupAll();

        // Error observation is required; an observer throwing must not break cleanup
        // or turn an ignored handler promise into an unhandled rejection.
        try {
            this.onError(this.failure);
        } catch { /* The required observer must not interrupt terminal cleanup. */ }
    }

    /** Snapshot automatic key material and observe the native acknowledgment. */
    setKey(participant, key, index) {
        if (this.closed || this.removed.has(participant)) {
            return Promise.resolve(false);
        }
        if (typeof participant !== 'string' || !participant || !Number.isSafeInteger(index) || index < 0
                || (key !== false && key !== null && (!(key instanceof Uint8Array) || key.length !== 32))) {
            this.fail(new Error('Invalid managed key update'));

            return Promise.resolve(false);
        }
        const snapshot = key ? key.slice() : null;

        return this.enqueue(() => this.bridge.setKey(participant, snapshot, index), participant, snapshot);
    }

    /** Bind an exact native receiver to its authenticated signaling owner. */
    handleReceiver(receiver, kind, participant) {
        if (this.closed || this.removed.has(participant)) {
            return Promise.resolve(false);
        }
        if (![ 'audio', 'video' ].includes(kind) || !receiver || typeof participant !== 'string' || !participant) {
            this.fail(new Error('Invalid native receiver ownership'));

            return Promise.resolve(false);
        }

        return this.enqueue(() => this.bridge.bindReceiver(receiver, participant), participant);
    }

    /** Verify that a sender belongs to this protected conference and local owner. */
    handleSender(sender, kind, participant) {
    // Creation-time native transforms already select the conference's local key.
    // Verify that this endpoint belongs to the protected conference. This
    // adapter cannot retrofit protection onto an ordinary peer connection.
        return this.enqueue(() => this.bridge.verifySender(sender, kind, participant), participant);
    }

    /** Tombstone one departed participant before dispatching native key removal. */
    cleanup(participant) {
        if (this.closed || this.removed.has(participant)) {
            return Promise.resolve(false);
        }
        if (typeof participant !== 'string' || !participant) {
            this.fail(new Error('Invalid removed participant'));

            return Promise.resolve(false);
        }

        // Tombstone synchronously and dispatch removal immediately, even if an
        // earlier key promise is pending. Native also rejects late keys for this ID.
        this.removed.add(participant);
        let removal;

        try {
            removal = Promise.resolve(this.bridge.removeParticipant(participant));
        } catch (error) {
            removal = Promise.reject(error);
        }
        const result = removal.then(accepted => {
            if (accepted === false && !this.closed) {
                throw new Error('Native participant removal rejected');
            }

            return accepted;
        });
        const observed = result.catch(error => {
            if (!this.closed) {
                this.fail(error);
            }
        });

        this.pending = Promise.all([ this.pending, observed ]).then(() => undefined);

        return result;
    }

    /** Keep creation-time protection immutable; disabling terminally closes the owner. */
    setEnabled(enabled) {
        if (!enabled) {
            return this.cleanupAll();
        }

        // Protection is immutable on each native PC. Enabling here never creates
        // transforms late or switches a plaintext PC into protected mode.
        return !this.closed;
    }

    /** Revoke the whole native conference before waiting for queued operations. */
    cleanupAll() {
        if (this.closed) {
            return this.closing;
        }
        this.closed = true;
        for (const key of this.snapshots) {
            key.fill(0);
        }
        this.snapshots.clear();

        // Do not queue terminal revocation behind unresolved key promises. The
        // bridge must terminally close the store and all owned media connections.
        try {
            this.closing = Promise.resolve(this.bridge.close());
        } catch (error) {
            this.closing = Promise.reject(error);
        }
        this.closing = this.closing.catch(error => this.fail(error));

        return this.closing;
    }

    /** Wait for all native operations and surface the first terminal failure. */
    async flush() {
    // A barrier for the conference owner/tests; upstream handlers do not await
    // setKey. Include operations appended while a previous one was settling.
        let pending;

        do {
            pending = this.pending;
            await pending;
        } while (pending !== this.pending);
        await this.closing;
        if (this.failure) {
            throw this.failure;
        }
    }
}
