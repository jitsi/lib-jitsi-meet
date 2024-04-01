export {};

declare global {
    interface Window {
        connectionTimes: any;
    }
    // function named createConnectionExternally
    function createConnectionExternally(): void;
}
