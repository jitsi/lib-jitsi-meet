import JitsiTrackError from './JitsiTrackError';
import * as JitsiTrackErrors from './JitsiTrackErrors';
import { PermissionDenialReason } from './service/RTC/MediaPermission';

describe('JitsiTrackError', () => {
    it('maps a NotAllowedError to a permission denial with the reason', () => {
        const error = new JitsiTrackError(
            { message: 'Permission denied by system', name: 'NotAllowedError' },
            {},
            [ 'audio' ],
            PermissionDenialReason.OS);

        expect(error.name).toBe(JitsiTrackErrors.PERMISSION_DENIED);
        expect(error.reason).toBe(PermissionDenialReason.OS);
        expect(error.gum.error.name).toBe('NotAllowedError');
    });

    it('makes any getUserMedia error a permission denial when a reason is given', () => {
        const error = new JitsiTrackError({ name: 'NotFoundError' }, {}, [ 'video' ], PermissionDenialReason.OS);

        expect(error.name).toBe(JitsiTrackErrors.PERMISSION_DENIED);
        expect(error.message).toBe('User denied permission to use device(s): video');
        expect(error.gum.error.name).toBe('NotFoundError');
    });

    it('has no reason for other errors', () => {
        const error = new JitsiTrackError({ name: 'NotFoundError' }, {}, [ 'video' ]);

        expect(error.name).toBe(JitsiTrackErrors.NOT_FOUND);
        expect(error.reason).toBeUndefined();
    });
});
