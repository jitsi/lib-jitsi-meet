import BrowserCapabilities from './BrowserCapabilities';

describe('BrowserCapabilities', () => {
    describe('supportsCameraPtz', () => {
        let browser: BrowserCapabilities;

        beforeEach(() => {
            browser = new BrowserCapabilities();

            if (!navigator.mediaDevices) {
                (navigator as any).mediaDevices = {};
            }
            if (!navigator.mediaDevices.getSupportedConstraints) {
                (navigator.mediaDevices as any).getSupportedConstraints = () => ({});
            }
        });

        it('returns true when getSupportedConstraints reports pan, tilt and zoom', () => {
            spyOn(navigator.mediaDevices, 'getSupportedConstraints')
                .and.returnValue({ pan: true, tilt: true, zoom: true } as any);

            expect(browser.supportsCameraPtz()).toBe(true);
        });

        it('returns false when only some PTZ constraints are reported (e.g. zoom-only)', () => {
            spyOn(navigator.mediaDevices, 'getSupportedConstraints').and.returnValue({ zoom: true } as any);

            expect(browser.supportsCameraPtz()).toBe(false);
        });

        it('returns false when no PTZ constraints are reported', () => {
            spyOn(navigator.mediaDevices, 'getSupportedConstraints').and.returnValue({} as any);

            expect(browser.supportsCameraPtz()).toBe(false);
        });
    });
});
