import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import browser from '../browser';

import ScreenObtainer from './ScreenObtainer';

describe('ScreenObtainer', () => {
    describe('getDisplayMedia error handling', () => {
        function obtainScreenError(gdmError: unknown): Promise<JitsiTrackError> {
            spyOn(navigator.mediaDevices, 'getDisplayMedia').and.returnValue(Promise.reject(gdmError));

            return new Promise((resolve, reject) => {
                (ScreenObtainer as any)._obtainScreenFromGetDisplayMedia(
                    () => reject(new Error('getDisplayMedia unexpectedly succeeded')),
                    resolve);
            });
        }

        it('reports PERMISSION_DENIED when the OS denied the capture', async () => {
            const error = await obtainScreenError(new DOMException('Permission denied by system', 'NotAllowedError'));

            expect(error.name).toBe(JitsiTrackErrors.PERMISSION_DENIED);
        });

        it('reports SCREENSHARING_USER_CANCELED when the user dismissed the picker', async () => {
            const error = await obtainScreenError(new DOMException('Permission denied', 'NotAllowedError'));

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_USER_CANCELED);
        });

        it('reports SCREENSHARING_GENERIC_ERROR for an error without a message', async () => {
            const error = await obtainScreenError({ name: 'NotAllowedError' });

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR);
        });

        it('reports SCREENSHARING_GENERIC_ERROR for an error that is not a DOMException', async () => {
            const error = await obtainScreenError(new TypeError('Invalid constraints'));

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR);
        });

        it('reports SCREENSHARING_GENERIC_ERROR when getDisplayMedia rejects with undefined', async () => {
            const error = await obtainScreenError(undefined);

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR);
        });

        it('reports SCREENSHARING_GENERIC_ERROR for a NotReadableError', async () => {
            const error = await obtainScreenError(new DOMException('Could not start video source', 'NotReadableError'));

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR);
        });
    });

    describe('audio constraints', () => {
        let savedOptions: unknown;

        beforeEach(() => {
            savedOptions = (ScreenObtainer as any).options;
            (ScreenObtainer as any).options = {};
            spyOn(browser, 'isChromiumBased').and.returnValue(true);
            spyOn(browser, 'isEngineVersionGreaterThan').and.callFake((version: number) => version < 146);
        });

        afterEach(() => {
            (ScreenObtainer as any).options = savedOptions;
        });

        function audioConstraints(electronVersion?: string, os = 'Mac OS') {
            spyOn(browser, 'getOS').and.returnValue(os);
            spyOn(browser, 'isElectron').and.returnValue(electronVersion !== undefined);
            spyOn(browser, 'getVersion').and.returnValue(electronVersion ?? '146.0.0.0');

            return (ScreenObtainer as any)._getAudioConstraints();
        }

        it('restricts own audio in Chrome', () => {
            expect(audioConstraints()).toEqual({ restrictOwnAudio: true });
        });

        for (const version of [ '43.4.0', '43.8.3', '44.0.0', '45.1.2' ]) {
            it(`restricts own audio in Electron ${version}`, () => {
                expect(audioConstraints(version)).toEqual({ restrictOwnAudio: true });
            });
        }

        it('restricts own audio in Electron on macOS as named by ua-parser-js 2', () => {
            expect(audioConstraints('44.0.0', 'macOS')).toEqual({ restrictOwnAudio: true });
        });

        it('restricts own audio in Electron on Windows', () => {
            expect(audioConstraints('44.0.0', 'Windows')).toEqual({ restrictOwnAudio: true });
        });

        it('falls back to echo cancellation in Electron on Linux, where it captures all audio', () => {
            const audio = audioConstraints('44.0.0', 'Linux');

            expect(audio.echoCancellation).toBe(true);
            expect(audio.restrictOwnAudio).toBeUndefined();
        });

        for (const version of [ '43.3.1', '42.9.0', '', 'abc' ]) {
            it(`falls back to echo cancellation in Electron ${JSON.stringify(version)}`, () => {
                const audio = audioConstraints(version);

                expect(audio.echoCancellation).toBe(true);
                expect(audio.restrictOwnAudio).toBeUndefined();
            });
        }
    });
});
