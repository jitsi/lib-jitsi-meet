// these declarations are a work in progress and will be added to as declarations are required

declare module '@jitsi/logger' {
    const getLogger: ( filename: unknown ) => ILogger;

    interface ILogger {
        info: ( msg: string ) => void;
    }
}
