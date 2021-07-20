export = SphinxService;
declare class SphinxService {
    sendRequest(audioFileBlob: any, callback: any): void;
    formatResponse(response: any): any[];
    verify(response: any): boolean;
}
