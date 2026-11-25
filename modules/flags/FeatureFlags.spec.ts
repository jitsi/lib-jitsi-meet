import browser from '../browser';

import FeatureFlags from './FeatureFlags';

describe('FeatureFlags', () => {
    describe('isRtpMidDemuxSupported', () => {
        let isChromiumBased: jasmine.Spy;
        let isEngineVersionGreaterThan: jasmine.Spy;
        let isReactNative: jasmine.Spy;

        beforeEach(() => {
            isChromiumBased = spyOn(browser, 'isChromiumBased').and.returnValue(false);
            isEngineVersionGreaterThan = spyOn(browser, 'isEngineVersionGreaterThan').and.returnValue(false);
            isReactNative = spyOn(browser, 'isReactNative').and.returnValue(false);
            FeatureFlags.init({
                rtpMidDemuxEnabled: true,
                ssrcRewritingEnabled: true
            });
        });

        afterEach(() => {
            FeatureFlags.init({});
        });

        it('is supported on Chromium 148 and later', () => {
            isChromiumBased.and.returnValue(true);
            isEngineVersionGreaterThan.and.callFake((version: number) => 148 > version);

            expect(FeatureFlags.isRtpMidDemuxSupported()).toBe(true);
        });

        it('is not supported on Chromium before 148', () => {
            isChromiumBased.and.returnValue(true);
            isEngineVersionGreaterThan.and.callFake((version: number) => 147 > version);

            expect(FeatureFlags.isRtpMidDemuxSupported()).toBe(false);
        });

        it('is supported on React Native, where the engine version is not known', () => {
            isReactNative.and.returnValue(true);

            expect(FeatureFlags.isRtpMidDemuxSupported()).toBe(true);
        });

        it('is not supported on other browsers', () => {
            expect(FeatureFlags.isRtpMidDemuxSupported()).toBe(false);
        });

        it('is not supported on React Native without the flag', () => {
            isReactNative.and.returnValue(true);
            FeatureFlags.init({ ssrcRewritingEnabled: true });

            expect(FeatureFlags.isRtpMidDemuxSupported()).toBe(false);
        });

        it('is not supported on React Native without SSRC rewriting', () => {
            isReactNative.and.returnValue(true);
            FeatureFlags.init({ rtpMidDemuxEnabled: true });

            expect(FeatureFlags.isRtpMidDemuxSupported()).toBe(false);
        });
    });
});
