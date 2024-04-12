
import Logger from '@jitsi/logger';
import watchRTC from '@testrtc/watchrtc-sdk';

import browser from '../browser';

import { isAnalyticsEnabled, isWatchRTCEnabled } from './functions';
import { IWatchRTCConfiguration } from './interfaces';

const logger = Logger.getLogger(__filename);

/**
 * Class that controls the watchRTC flow, because it overwrites and proxies global function it should only be
 * initialized once.
 */
class WatchRTCHandler {
    options?: IWatchRTCConfiguration;

    /**
     * Initialize watchRTC, it overwrites GUM and PeerConnection global functions and adds a proxy over them
     * used to capture stats.
     *
     * @param {Object} options - Init options.
     * @returns {void}
     */
    init(options: any): void {
        if (isWatchRTCEnabled(options)) {

            // @ts-ignore
            if (browser.isReactNative()) {
                logger.warn('Cannot initialize WatchRTC in a react native environment!');
                return;
            }

            if (!isAnalyticsEnabled(options)) {
                logger.error('Cannot initialize WatchRTC when analytics or third party requests are disabled.');
                return;
            }

            try {
                if (options?.watchRTCConfigParams?.rtcApiKey) {
                    watchRTC.init({
                        rtcApiKey: options.watchRTCConfigParams.rtcApiKey,
                    });
                    this.options = options.watchRTCConfigParams;
                    logger.info('WatchRTC initialized.');
                } else {
                    logger.error('WatchRTC is enabled but missing API key.');
                }
            } catch (error) {
                logger.error('Failed to initialize WatchRTC: ', error);
            }
        }
    }

    /**
     * Begin watchRTC session considering roomName and userName if already not available
     *
     * @param {string} roomName - The room name we are currently in.
     * @param {string} userName - The user name. This value is obtained from
     * JitsiConference.prototype.myUserId
     * @returns {void}
     */
    start(roomName: string, userName: string): void {
        try {
            if (this.options) {
                this.options.rtcRoomId = this.options.rtcRoomId ? this.options.rtcRoomId : roomName;
                this.options.rtcPeerId = this.options.rtcPeerId ? this.options.rtcPeerId : userName;
                watchRTC.setConfig(this.options);
                logger.info('WatchRTC setConfig.');
            }
        } catch (error) {
            logger.error('Failed to start WatchRTC session: ', error);
        }
    }
}

export default new WatchRTCHandler();