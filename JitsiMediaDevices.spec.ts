import JitsiMediaDevices from './JitsiMediaDevices';

describe('JitsiMediaDevices', () => {
    describe('getCameraPTZPermission', () => {
        let mediaDevices: JitsiMediaDevices;

        beforeEach(() => {
            mediaDevices = new JitsiMediaDevices();

            if (!navigator.permissions) {
                (navigator as any).permissions = { query: () => Promise.resolve({ state: 'prompt' }) };
            }
        });

        it('queries the camera permission with the panTiltZoom descriptor', async () => {
            const query = spyOn(navigator.permissions, 'query')
                .and.returnValue(Promise.resolve({ state: 'granted' } as any));

            await mediaDevices.getCameraPTZPermission();

            expect(query).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'camera',
                panTiltZoom: true }));
        });

        it('resolves the queried permission state', async () => {
            spyOn(navigator.permissions, 'query').and.returnValue(Promise.resolve({ state: 'denied' } as any));

            await expectAsync(mediaDevices.getCameraPTZPermission()).toBeResolvedTo('denied');
        });

        it('resolves to prompt when the query rejects (permission not exposed by the browser)', async () => {
            spyOn(navigator.permissions, 'query').and.returnValue(Promise.reject(new Error('unsupported')));

            await expectAsync(mediaDevices.getCameraPTZPermission()).toBeResolvedTo('prompt');
        });
    });
});
