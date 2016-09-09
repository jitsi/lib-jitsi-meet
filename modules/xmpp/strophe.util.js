/* global Strophe */
/**
 * Strophe logger implementation. Logs from level WARN and above.
 */
import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
import GlobalOnErrorHandler from "../util/GlobalOnErrorHandler";

export default function () {

    Strophe.log = function (level, msg) {
        // Our global handler reports uncaught errors to the stats which may
        // interpret those as partial call failure.
        // Strophe log entry about secondary request timeout does not mean that
        // it's a final failure(the request will be restarted), so we lower it's
        // level here to a warning.
        if (typeof msg === 'string' &&
                msg.indexOf("Request ") !== -1 &&
                msg.indexOf("timed out (secondary), restarting") !== -1) {
            level = Strophe.LogLevel.WARN;
        }
        switch (level) {
            case Strophe.LogLevel.WARN:
                logger.warn("Strophe: " + msg);
                break;
            case Strophe.LogLevel.ERROR:
            case Strophe.LogLevel.FATAL:
                msg = "Strophe: " + msg;
                GlobalOnErrorHandler.callErrorHandler(new Error(msg));
                logger.error(msg);
                break;
        }
    };

    Strophe.getStatusString = function (status) {
        switch (status) {
            case Strophe.Status.ERROR:
                return "ERROR";
            case Strophe.Status.CONNECTING:
                return "CONNECTING";
            case Strophe.Status.CONNFAIL:
                return "CONNFAIL";
            case Strophe.Status.AUTHENTICATING:
                return "AUTHENTICATING";
            case Strophe.Status.AUTHFAIL:
                return "AUTHFAIL";
            case Strophe.Status.CONNECTED:
                return "CONNECTED";
            case Strophe.Status.DISCONNECTED:
                return "DISCONNECTED";
            case Strophe.Status.DISCONNECTING:
                return "DISCONNECTING";
            case Strophe.Status.ATTACHED:
                return "ATTACHED";
            default:
                return "unknown";
        }
    };
}
