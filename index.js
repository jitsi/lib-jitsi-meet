const ljm = require('./JitsiMeetJS').default;

/**
 * Tries to deal with the following problem: {@code JitsiMeetJS} is not only
 * this module, it's also a global (i.e. attached to {@code window}) namespace
 * for all globals of the projects in the Jitsi Meet family. If lib-jitsi-meet
 * is loaded through an HTML {@code script} tag, {@code JitsiMeetJS} will
 * automatically be attached to {@code window} by webpack. Unfortunately,
 * webpack's source code does not check whether the global variable has already
 * been assigned and overwrites it. Which is OK for the module
 * {@code JitsiMeetJS} but is not OK for the namespace {@code JitsiMeetJS}
 * because it may already contain the values of other projects in the Jitsi Meet
 * family. The solution offered here works around webpack by merging all
 * existing values of the namespace {@code JitsiMeetJS} into the module
 * {@code JitsiMeetJS}.
 *
 * @param {Object} module - The module {@code JitsiMeetJS} (which will be
 * exported and may be attached to {@code window} by webpack later on).
 * @private
 * @returns {Object} - A {@code JitsiMeetJS} module which contains all existing
 * value of the namespace {@code JitsiMeetJS} (if any).
 */
function _mergeNamespaceAndModule(module) {
    return (
        typeof window.JitsiMeetJS === 'object'
            ? Object.assign({}, window.JitsiMeetJS, module)
            : module);
}

module.exports = _mergeNamespaceAndModule(ljm);
