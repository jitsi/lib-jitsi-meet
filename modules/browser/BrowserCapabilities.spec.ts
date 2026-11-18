import browser from './index';

describe('BrowserCapabilities', () => {
    it('isMacOS accepts the names of macOS of ua-parser-js 1 and 2', () => {
        const getOS = spyOn(browser, 'getOS');

        getOS.and.returnValue('Mac OS');
        expect(browser.isMacOS()).toBe(true);
        getOS.and.returnValue('macOS');
        expect(browser.isMacOS()).toBe(true);
        getOS.and.returnValue('Windows');
        expect(browser.isMacOS()).toBe(false);
    });
});
