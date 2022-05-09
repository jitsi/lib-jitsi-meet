/**
 * Creates new instance of <tt>ComponentsVersions</tt> which will be discovering
 * the versions of conferencing system components in given
 * <tt>JitsiConference</tt>.
 * @param conference <tt>JitsiConference</tt> instance which will be used to
 *        listen for focus presence updates.
 * @constructor
 */
export default function ComponentsVersions(conference: any): void;
export default class ComponentsVersions {
    /**
     * Creates new instance of <tt>ComponentsVersions</tt> which will be discovering
     * the versions of conferencing system components in given
     * <tt>JitsiConference</tt>.
     * @param conference <tt>JitsiConference</tt> instance which will be used to
     *        listen for focus presence updates.
     * @constructor
     */
    constructor(conference: any);
    versions: {};
    conference: any;
    processVersions(versions: any, mucResource: any, mucJid: any): void;
    /**
     * Obtains the version of conferencing system component.
     * @param componentName the name of the component for which we want to obtain
     *        the version.
     * @returns {String} which describes the version of the component identified by
     *          given <tt>componentName</tt> or <tt>undefined</tt> if not found.
     */
    getComponentVersion(componentName: any): string;
}
