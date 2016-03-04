var logger = require("jitsi-meet-logger").getLogger(__filename);

/**
 * The constant for the name of the focus component.
 * @type {string}
 */
ComponentsVersions.FOCUS_COMPONENT = "focus";
/**
 * The constant for the name of the videobridge component.
 * @type {string}
 */
ComponentsVersions.VIDEOBRIDGE_COMPONENT = "videobridge";
/**
 * The contant for the name of the XMPP server component.
 * @type {string}
 */
ComponentsVersions.XMPP_SERVER_COMPONENT = "xmpp";

/**
 * Creates new instance of <tt>ComponentsVersions</tt> which will be discovering
 * the versions of conferencing system components in given <tt>ChatRoom</tt>.
 * @param chatRoom <tt>ChatRoom</tt> instance which will be used to listen for
 *        focus presence updates.
 * @constructor
 */
function ComponentsVersions(chatRoom) {

    this.versions = {};

    this.chatRoom = chatRoom;
    this.chatRoom.addPresenceListener(
        'versions', this.processPresence.bind(this));
}

ComponentsVersions.prototype.processPresence =
function(node, mucResource, mucJid) {

    if (node.attributes.xmlns !== 'http://jitsi.org/jitmeet') {
        logger.warn("Ignored presence versions node - invalid xmlns", node);
        return;
    }

    if (!this.chatRoom.isFocus(mucJid)) {
        logger.warn(
            "Received versions not from the focus user: " + node, mucJid);
        return;
    }

    node.children.forEach(function(item){

        var componentName = item.attributes.name;
        if (componentName !== ComponentsVersions.FOCUS_COMPONENT &&
            componentName !== ComponentsVersions.XMPP_SERVER_COMPONENT &&
            componentName !== ComponentsVersions.VIDEOBRIDGE_COMPONENT) {
            logger.warn(
                "Received version for not supported component name: "
                    + componentName);
            return;
        }

        var version = item.value;
        if (this.versions[componentName] !== version) {
            this.versions[componentName] = version;
            logger.info("Got " + componentName + " version: " + version);
        }
    }.bind(this));
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

