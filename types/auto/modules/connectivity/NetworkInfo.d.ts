export const NETWORK_INFO_EVENT: "NETWORK_INFO_CHANGED";
/**
 * Module provides information about the current status of the internet
 * connection. Lib-jitsi-meet doesn't have any logic for detecting internet
 * online/offline, but rather it relies on the information supplied by the app
 * that uses it. By default the online state is assumed and the lib acts as if
 * it was connected. See {@link JitsiMeetJS.setNetworkInfo}.
 */
export class NetworkInfo extends Listenable {
    /**
     * Creates new {@link NetworkInfo} instance.
     */
    constructor();
    _current: {
        isOnline: boolean;
    };
    /**
     * Updates the network info state.
     * @param {boolean} isOnline - {@code true} if internet is online or {@code false} otherwise.
     */
    updateNetworkInfo({ isOnline }: boolean): void;
    /**
     * Returns the online/offline internet status. By default the value is {@code true} and changes only if
     * the lib's user wires the state through {@link JitsiMeetJS.setNetworkInfo} like the jitsi-meet does. Because of
     * that any logic should still assume that the internet may be offline and should handle the failure gracefully.
     * It's only a good hint in the other way around: to pause internet operations until it comes back online.
     * @returns {boolean}
     */
    isOnline(): boolean;
}
export default networkInfo;
import Listenable from "../util/Listenable";
declare const networkInfo: NetworkInfo;
