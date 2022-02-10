declare module '@jitsi/logger' {
    const getLogger: ( filename: unknown ) => ILogger;

    interface ILogger {
        info: ( msg: string ) => void;
    }
}
