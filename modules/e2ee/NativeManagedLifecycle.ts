/** Native lifecycle plumbing; the original automatic key and Olm algorithms remain unchanged. */
export function listenNativeE2EE(owner, emitter, event, callback, retired = false) { // eslint-disable-line max-params
    if (owner._nativeLifecycle) {
        owner._nativeLifecycle.listen(emitter, event, callback, retired);
    } else {
        emitter.on(event, callback);
    }
}

/** Track delayed original key operations only for the native platform path. */
export function runNativeE2EE(owner, callback) {
    return owner._nativeLifecycle ? (...args) => owner._nativeLifecycle.run(callback.bind(owner), args) : callback;
}

/** Add a terminal guard around the original entropy operation, without replacing generation. */
export function initializeNativeManaged(handler) {
    if (!handler._nativeLifecycle) {
        return;
    }
    const generate = handler._generateKey.bind(handler);

    handler._generateKey = () => {
        if (handler.e2eeCtx.closed) {
            throw new Error('Native conference closed');
        }

        return generate();
    };
}

/** Guard terminal Olm boundaries without replacing automatic protocol methods. */
export function initializeNativeOlm(adapter, context) {
    if (!context) {
        return;
    }
    adapter._nativeLifecycle = context.createLifecycle();
    adapter._init.catch(error => context.fail(error));
    adapter._nativeRequestOwners = new Map();
    adapter._nativeParticipants = new Set();
    const getData = adapter._getParticipantOlmData.bind(adapter);

    adapter._getParticipantOlmData = participant => {
        if (!adapter._nativeClearing && (context.closed || context.removed.has(participant.getId()))) {
            throw new Error('Native participant retired');
        }
        adapter._nativeParticipants.add(participant);

        return getData(participant);
    };
    const clear = adapter.clearParticipantSession.bind(adapter);

    adapter.clearParticipantSession = participant => {
        adapter._nativeClearing = true;
        try {
            return clear(participant);
        } finally {
            adapter._nativeClearing = false;
        }
    };
    for (const name of [ 'updateKey', 'updateCurrentMediaKey' ]) {
        const original = adapter[name].bind(adapter);

        adapter[name] = (...args) => {
            if (context.closed) {
                throw new Error('Native conference closed');
            }

            return original(...args);
        };
    }
    const publish = adapter._onIdKeysReady.bind(adapter);

    adapter._onIdKeysReady = keys => {
        if (!context.closed) {
            publish(keys);
        }
    };
    const originalSend = adapter._sendMessage.bind(adapter);
    const originalInit = adapter._sendSessionInit.bind(adapter);
    const callbacks = adapter._sessionReadyCallbacks;
    const setCallback = callbacks.set.bind(callbacks);

    callbacks.set = (id, resolve) => {
        if (context.closed || context.removed.has(id)) {
            resolve();
        } else {
            setCallback(id, resolve);
        }

        return callbacks;
    };
    adapter._sendSessionInit = participant => {
        if (context.closed || context.removed.has(participant.getId())) {
            return Promise.reject(new Error('Native participant retired'));
        }

        return originalInit(participant);
    };
    adapter._sendMessage = (data, id) => {
        const uuid = data?.olm?.data?.uuid;
        const request = uuid && adapter._reqs.get(uuid);

        if (context.closed || context.removed.has(id)) {
            request?.reject(new Error('Native participant retired'));
            if (uuid) {
                adapter._reqs.delete(uuid);
            }

            return;
        }
        if (request) {
            adapter._nativeRequestOwners.set(uuid, id);
            Promise.resolve(request).catch(() => undefined)
.finally(() => adapter._nativeRequestOwners.delete(uuid));
        }
        originalSend(data, id);
    };
}

/** Release only requests and session waiters owned by the retiring scope. */
function cancelRequests(adapter, id?: string) {
    for (const [ uuid, request ] of adapter._reqs) {
        if (id === undefined || adapter._nativeRequestOwners.get(uuid) === id) {
            request.reject(new Error('Native E2EE operation cancelled'));
            adapter._reqs.delete(uuid);
            adapter._nativeRequestOwners.delete(uuid);
        }
    }
    for (const [ participant, resolve ] of adapter._sessionReadyCallbacks) {
        if (id === undefined || participant === id) {
            resolve();
            adapter._sessionReadyCallbacks.delete(participant);
        }
    }
    if (id === undefined) {
        adapter._sessionInitialization?.resolve();
    }
}

/** Drain departed-owner callbacks before original USER_LEFT session disposal. */
export async function prepareNativeParticipantLeave(handler, id) {
    const adapter = handler._olmAdapter;

    cancelRequests(adapter, id);
    await adapter._nativeLifecycle.drain(id);
}

/** Revoke media immediately, drain original work, and then free Olm resources. */
export function disposeNativeManaged(handler) {
    if (handler._nativeDisposal) {
        return handler._nativeDisposal;
    }
    const context = handler.e2eeCtx;
    const adapter = handler._olmAdapter;
    const participants = new Set([ ...handler.conference.getParticipants(), ...adapter._nativeParticipants ]);

    // Terminal revocation and callback gates precede every await, including Olm bootstrap.
    const nativeClose = context.cleanupAll();

    handler._nativeLifecycle.stop();
    adapter._nativeLifecycle.stop();
    handler._rotateKey.cancel();
    handler._ratchetKey.cancel();
    context.disposal.debouncesCancelled = true;
    cancelRequests(adapter);
    handler._enabling?.catch(() => undefined);
    handler._enabling?.reject(new Error('Native conference closed'));
    handler._nativeDisposal = (async () => {
        let initializationError;
        const cleanupErrors = [];

        try {
            await adapter._init;
        } catch (error) {
            initializationError = error;
        }
        cancelRequests(adapter);
        await Promise.all([ handler._nativeLifecycle.drain(), adapter._nativeLifecycle.drain() ]);
        context.disposal.callbacksDrained = true;
        for (const participant of adapter._nativeParticipants) {
            participants.add(participant);
        }
        for (const participant of participants) {
            try {
                adapter.clearParticipantSession(participant);
            } catch (error) {
                cleanupErrors.push(error);
            }
        }
        adapter._reqs.clear();
        adapter._nativeRequestOwners.clear();
        adapter._nativeParticipants.clear();
        adapter._sessionInitialization = undefined;
        adapter._mediaKey?.fill?.(0);
        adapter._mediaKey = undefined;
        handler._key?.fill?.(0);
        handler._key = undefined;
        try {
            adapter._olmAccount?.free();
        } catch (error) {
            cleanupErrors.push(error);
        } finally {
            adapter._olmAccount = undefined;
        }
        try {
            adapter._olmUtility?.free();
        } catch (error) {
            cleanupErrors.push(error);
        } finally {
            adapter._olmUtility = undefined;
        }
        context.disposal.sessionsFreed = cleanupErrors.length === 0;
        const nativeResults = await Promise.allSettled([ nativeClose, context.flush() ]);

        for (const result of nativeResults) {
            if (result.status === 'rejected') {
                cleanupErrors.push(result.reason);
            }
        }
        if (cleanupErrors.length) {
            throw cleanupErrors[0];
        }
        context.disposal.keysCleared = true;
        context.disposal.nativeContexts = 0;
        if (initializationError) {
            throw initializationError;
        }
    })();
    handler._nativeDisposal.catch(error => context.fail(error));

    return handler._nativeDisposal;
}
