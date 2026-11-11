import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';

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

        it('does not report PERMISSION_DENIED for an error without a message', async () => {
            const error = await obtainScreenError({ name: 'NotAllowedError' });

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_USER_CANCELED);
        });

        it('reports SCREENSHARING_GENERIC_ERROR for a NotReadableError', async () => {
            const error = await obtainScreenError(new DOMException('Could not start video source', 'NotReadableError'));

            expect(error.name).toBe(JitsiTrackErrors.SCREENSHARING_GENERIC_ERROR);
        });
    });
});
