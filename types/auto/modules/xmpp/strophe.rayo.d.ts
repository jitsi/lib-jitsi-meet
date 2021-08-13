declare const RayoConnectionPlugin_base: {
    new (...args: any[]): {
        connection: any;
        init(connection: any): void;
    };
};
/**
 *
 */
export default class RayoConnectionPlugin extends RayoConnectionPlugin_base {
    /**
     *
     * @param iq
     */
    onRayo(iq: any): void;
    /**
     *
     * @param to
     * @param from
     * @param roomName
     * @param roomPass
     * @param focusMucJid
     */
    dial(to: any, from: any, roomName: any, roomPass: any, focusMucJid: any): Promise<any>;
    callResource: any;
    /**
     *
     */
    hangup(): Promise<any>;
}
export {};
