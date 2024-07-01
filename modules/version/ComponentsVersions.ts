import { getLogger } from '@jitsi/logger';

const logger = getLogger(__filename);

/**
 * Discovers component versions in a conference.
 */
export default class ComponentsVersions {
    versions: {[key: string]: string};
    conference: any;

    /**
     * Creates new instance of <tt>ComponentsVersions</tt> which will be discovering
     * the versions of conferencing system components in given
     * <tt>JitsiConference</tt>.
     * @param conference <tt>JitsiConference</tt> instance which will be used to
     *        listen for focus presence updates.
     * @constructor
     */
    constructor(conference) {
        this.versions = {};

        this.conference = conference;
        this.conference.addCommandListener('versions', this._processVersions.bind(this));
    }

    /**
     * Processes versions information from presence.
     *
     * @param {*} versions - The versions element.
     * @param {*} mucJid - MUC JID for the sender.
     * @returns {void}
     */
    _processVersions(versions, _, mucJid) {
        if (!this.conference.isFocus(mucJid)) {
            logger.warn(
                `Received versions not from the focus user: ${versions}`,
                mucJid);

            return;
        }

        versions.children.forEach(component => {
            const name = component.attributes.name;
            const version = component.value;

            if (this.versions[name] !== version) {
                this.versions[name] = version;
                logger.info(`Got ${name} version: ${version}`);
            }
        });
    }

    /**
     * Obtains the version of conferencing system component.
     * @param componentName the name of the component for which we want to obtain
     *        the version.
     * @returns {String} which describes the version of the component identified by
     *          given <tt>componentName</tt> or <tt>undefined</tt> if not found.
     */
    getComponentVersion(componentName) {
        return this.versions[componentName];
    }
}
