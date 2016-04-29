var logger = require("jitsi-meet-logger").getLogger(__filename);

module.exports = {
    /**
     * Returns JitsiTrackErrors based on the error object passed by GUM
     * @param error the error
     * @param {Array} devices Array with the requested devices
     */
    parseError: function (error, devices) {
        if (typeof error === "object") {
          var constraintName = error.constraintName;
          var name;
          if (constraintName
                  && (name = error.name)
                  && (name == "ConstraintNotSatisfiedError"
                      || name == "OverconstrainedError")
                  && (constraintName == "minWidth"
                      || constraintName == "maxWidth"
                      || constraintName == "minHeight"
                      || constraintName == "maxHeight"
                      || constraintName == "width"
                      || constraintName == "height")
                  && (devices || []).indexOf("video") !== -1) {
              return this.UNSUPPORTED_RESOLUTION;
          }
          if (error.type === "jitsiError") {
              return error.errorObject;
          }
        }
        // XXX We're about to lose the details represented by error and devices
        // (because we're about to generalize them to GENERAL). At the very
        // least log the details.
        logger.error('Parsing error into ' + this.GENERAL + ': ' + error);
        return this.GENERAL;
    },
    UNSUPPORTED_RESOLUTION: "gum.unsupported_resolution",
    /**
     * An event which indicates that the jidesha extension for Firefox is
     * needed to proceed with screen sharing, and that it is not installed.
     */
    FIREFOX_EXTENSION_NEEDED: "gum.firefox_extension_needed",
    CHROME_EXTENSION_INSTALLATION_ERROR:
        "gum.chrome_extension_installation_error",
    CHROME_EXTENSION_USER_CANCELED:
        "gum.chrome_extension_user_canceled",
    GENERAL: "gum.general",
    TRACK_IS_DISPOSED: "track.track_is_disposed",
    TRACK_MUTE_UNMUTE_IN_PROGRESS: "track.mute_unmute_inprogress"
};
