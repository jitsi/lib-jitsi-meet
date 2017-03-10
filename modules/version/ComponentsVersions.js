var logger = require('jitsi-meet-logger').getLogger(__filename);
var Statistics = require('../statistics/statistics');

/**
 * The constant for the name of the focus component.
 * @type {string}
 */
ComponentsVersions.FOCUS_COMPONENT = 'focus';
/**
 * The constant for the name of the videobridge component.
 * @type {string}
 */
ComponentsVersions.VIDEOBRIDGE_COMPONENT = 'videobridge';
/**
 * The constant for the name of the XMPP server component.
 * @type {string}
 */
ComponentsVersions.XMPP_SERVER_COMPONENT = 'xmpp';

/**
 * Creates new instance of <tt>ComponentsVersions</tt> which will be discovering
 * the versions of conferencing system components in given
 * <tt>JitsiConference</tt>.
 * @param conference <tt>JitsiConference</tt> instance which will be used to
 *        listen for focus presence updates.
 * @constructor
 */
function ComponentsVersions(conference) {

    this.versions = {};

    this.conference = conference;
    this.conference.addCommandListener(
        'versions', this.processPresence.bind(this));
}

ComponentsVersions.prototype.processPresence
    = function(node, mucResource, mucJid) {

        if (node.attributes.xmlns !== 'http://jitsi.org/jitmeet') {
            logger.warn('Ignored presence versions node - invalid xmlns', node);
            return;
        }

        if (!this.conference._isFocus(mucJid)) {
            logger.warn(
            'Received versions not from the focus user: ' + node, mucJid);
            return;
        }

        var log = [];
        node.children.forEach(function(item) {

            var componentName = item.attributes.name;
            if (componentName !== ComponentsVersions.FOCUS_COMPONENT
            && componentName !== ComponentsVersions.XMPP_SERVER_COMPONENT
            && componentName !== ComponentsVersions.VIDEOBRIDGE_COMPONENT) {
                logger.warn(
                'Received version for not supported component name: '
                    + componentName);
                return;
            }

            var version = item.value;
            if (this.versions[componentName] !== version) {
                this.versions[componentName] = version;
                logger.info('Got ' + componentName + ' version: ' + version);

                log.push({
                    id: 'component_version',
                    component: componentName,
                    version});
            }
        }.bind(this));

    // logs versions to stats
        if (log.length > 0) {
            Statistics.sendLog(JSON.stringify(log));
        }
    };

/**
 * Obtains the version of conferencing system component.
 * @param componentName the name of the component for which we want to obtain
 *        the version.
 * @returns {String} which describes the version of the component identified by
 *          given <tt>componentName</tt> or <tt>undefined</tt> if not found.
 */
ComponentsVersions.prototype.getComponentVersion = function(componentName) {
    return this.versions[componentName];
};

module.exports = ComponentsVersions;
