import Listenable from '../util/Listenable';
import { nextTick } from '../util/TestUtils';
import { MediaSessionEvents } from '../xmpp/MediaSessionEvents';

import SendVideoController, { IVideoConstraint } from './SendVideoController';

/* eslint-disable require-jsdoc */
class MockLocalVideoTrack {
    private _sourceName: string;

    constructor(sourceName: string) {
        this._sourceName = sourceName;
    }

    getSourceName(): string {
        return this._sourceName;
    }
}

class MockSession extends Listenable {
    isP2P: boolean;
    setSenderVideoConstraint: jasmine.Spy;

    constructor(isP2P = false) {
        super();
        this.isP2P = isP2P;
        this.setSenderVideoConstraint = jasmine.createSpy('setSenderVideoConstraint').and.returnValue(Promise.resolve());
    }

    // Accepts string | number for maxHeight to simulate the P2P XML path (getAttribute returns a string).
    emitConstraints(constraints: Array<{ maxHeight: number | string; sourceName: string }>): void {
        this.eventEmitter.emit(MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED, this, constraints);
    }
}

class MockConference {
    private _activeSession: MockSession | undefined;
    private _sessions: MockSession[];
    private _localTracks: MockLocalVideoTrack[];

    constructor() {
        this._activeSession = undefined;
        this._sessions = [];
        this._localTracks = [];
    }

    getActiveMediaSession(): MockSession | undefined {
        return this._activeSession;
    }

    getMediaSessions(): MockSession[] {
        return this._sessions;
    }

    getLocalVideoTracks(): MockLocalVideoTrack[] {
        return this._localTracks;
    }

    setActiveSession(session: MockSession): void {
        this._activeSession = session;
    }

    addSession(session: MockSession): void {
        this._sessions.push(session);
    }

    addLocalTrack(track: MockLocalVideoTrack): void {
        this._localTracks.push(track);
    }
}
/* eslint-enable require-jsdoc */

describe('SendVideoController', () => {
    let conference: MockConference;
    let controller: SendVideoController;
    let jvbSession: MockSession;
    let p2pSession: MockSession;
    const SOURCE = 'endpoint1-v0';

    beforeEach(() => {
        conference = new MockConference();
        controller = new SendVideoController(conference as any);
        jvbSession = new MockSession(false);
        p2pSession = new MockSession(true);

        conference.addSession(jvbSession);
        conference.addSession(p2pSession);
        conference.addLocalTrack(new MockLocalVideoTrack(SOURCE));
    });

    describe('JVB-only constraint propagation', () => {
        beforeEach(() => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);
            controller.onMediaSessionStarted(p2pSession);
        });

        it('applies bridge constraint to all sessions when JVB is active', async () => {
            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(360, SOURCE);
            expect(p2pSession.setSenderVideoConstraint).toHaveBeenCalledWith(360, SOURCE);
        });

        it('does not propagate when the emitting session is not the active session', async () => {
            // String maxHeight simulates P2P content-modify (XML getAttribute); the inactive path coerces it.
            p2pSession.emitConstraints([ { sourceName: SOURCE, maxHeight: '180' } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).not.toHaveBeenCalled();
            expect(p2pSession.setSenderVideoConstraint).not.toHaveBeenCalled();
        });

        it('clamps to min(preferred, remote) when bridge sends a value lower than preferred', async () => {
            await controller.setPreferredSendMaxFrameHeight(720);
            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(360, SOURCE);
        });

        it('normalises maxHeight=-1 to MAX_LOCAL_RESOLUTION', async () => {
            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 0 } ]);
            await nextTick();
            jvbSession.setSenderVideoConstraint.calls.reset();

            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: -1 } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(2160, SOURCE);
        });

        it('skips propagation when the constraint value has not changed', async () => {
            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();
            jvbSession.setSenderVideoConstraint.calls.reset();

            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).not.toHaveBeenCalled();
        });
    });

    describe('P2P constraint race fix', () => {
        it('uses P2P content-modify constraint when P2P becomes active, ignoring stale JVB bridge value', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);
            controller.onMediaSessionStarted(p2pSession);

            // P2P content-modify arrives while JVB is still active — stored but not propagated.
            // String maxHeight simulates XML getAttribute on the P2P path; the inactive path coerces it.
            p2pSession.emitConstraints([ { sourceName: SOURCE, maxHeight: '2160' } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).not.toHaveBeenCalled();
            expect(p2pSession.setSenderVideoConstraint).not.toHaveBeenCalled();

            // Bridge sends 0 while JVB is active — applied to all sessions.
            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 0 } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(0, SOURCE);
            expect(p2pSession.setSenderVideoConstraint).toHaveBeenCalledWith(0, SOURCE);

            jvbSession.setSenderVideoConstraint.calls.reset();
            p2pSession.setSenderVideoConstraint.calls.reset();

            // P2P becomes active. configureConstraintsForLocalSources must use the P2P-stored
            // value (2160), not the stale JVB bridge value (0).
            conference.setActiveSession(p2pSession);
            controller.configureConstraintsForLocalSources();
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(2160, SOURCE);
            expect(p2pSession.setSenderVideoConstraint).toHaveBeenCalledWith(2160, SOURCE);
        });

        it('ignores bridge constraint updates arriving after P2P becomes active', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);
            controller.onMediaSessionStarted(p2pSession);

            conference.setActiveSession(p2pSession);
            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 180 } ]);
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).not.toHaveBeenCalled();
            expect(p2pSession.setSenderVideoConstraint).not.toHaveBeenCalled();
        });

        it('falls back to preferredSendMaxFrameHeight when P2P becomes active with no stored constraint', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);
            controller.onMediaSessionStarted(p2pSession);

            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 0 } ]);
            await nextTick();

            jvbSession.setSenderVideoConstraint.calls.reset();
            p2pSession.setSenderVideoConstraint.calls.reset();

            conference.setActiveSession(p2pSession);
            controller.configureConstraintsForLocalSources();
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(2160, SOURCE);
            expect(p2pSession.setSenderVideoConstraint).toHaveBeenCalledWith(2160, SOURCE);
        });
    });

    describe('configureConstraintsForLocalSources', () => {
        it('applies preferred resolution when no remote constraints have been received', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);

            controller.configureConstraintsForLocalSources();
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(2160, SOURCE);
        });

        it('applies min(preferred, remote) when active session has a stored constraint', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);

            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();

            jvbSession.setSenderVideoConstraint.calls.reset();
            controller.configureConstraintsForLocalSources();
            await nextTick();

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(360, SOURCE);
        });
    });

    describe('setPreferredSendMaxFrameHeight', () => {
        it('re-propagates using active session constraints after preference changes', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);

            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();
            jvbSession.setSenderVideoConstraint.calls.reset();

            await controller.setPreferredSendMaxFrameHeight(180);

            expect(jvbSession.setSenderVideoConstraint).toHaveBeenCalledWith(180, SOURCE);
        });

        it('only iterates source names from the active session', async () => {
            conference.setActiveSession(jvbSession);
            controller.onMediaSessionStarted(jvbSession);
            controller.onMediaSessionStarted(p2pSession);

            const OTHER_SOURCE = 'endpoint2-v0';

            conference.addLocalTrack(new MockLocalVideoTrack(OTHER_SOURCE));

            jvbSession.emitConstraints([ { sourceName: SOURCE, maxHeight: 360 } ]);
            await nextTick();

            conference.setActiveSession(p2pSession);
            p2pSession.emitConstraints([ { sourceName: OTHER_SOURCE, maxHeight: 720 } ]);
            await nextTick();

            jvbSession.setSenderVideoConstraint.calls.reset();
            p2pSession.setSenderVideoConstraint.calls.reset();

            await controller.setPreferredSendMaxFrameHeight(480);

            const calledSources = p2pSession.setSenderVideoConstraint.calls.allArgs().map(([ , src ]) => src);

            expect(calledSources).toContain(OTHER_SOURCE);
            expect(calledSources).not.toContain(SOURCE);
        });
    });
});
