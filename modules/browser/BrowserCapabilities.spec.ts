import BrowserCapabilities from './BrowserCapabilities';

describe('BrowserCapabilities', () => {
    describe('_getIOSVersion', () => {
        let browser: BrowserCapabilities;

        beforeEach(() => {
            browser = new BrowserCapabilities();
            spyOn(browser, 'isWebKitBased').and.returnValue(true);
        });

        it('prefers the Safari Version/ token over the frozen OS token on iOS 26+', () => {
            // iOS 26 Safari freezes "CPU iPhone OS 18_7" while Version/ carries the real 26.x.
            spyOn(browser, 'getVersion').and.returnValue('26.5');
            spyOn(browser, 'getOSVersion').and.returnValue('18.7');

            expect(browser._getIOSVersion()).toBe(26);
        });

        it('uses the Version/ token on older iOS where it matches the OS version', () => {
            spyOn(browser, 'getVersion').and.returnValue('17.5');
            spyOn(browser, 'getOSVersion').and.returnValue('17.5');

            expect(browser._getIOSVersion()).toBe(17);
        });

        it('falls back to the OS token when there is no Version/ token', () => {
            spyOn(browser, 'getVersion').and.returnValue('');
            spyOn(browser, 'getOSVersion').and.returnValue('15.1');

            expect(browser._getIOSVersion()).toBe(15);
        });

        it('returns -1 on non-WebKit browsers', () => {
            (browser.isWebKitBased as jasmine.Spy).and.returnValue(false);

            expect(browser._getIOSVersion()).toBe(-1);
        });
    });
});
