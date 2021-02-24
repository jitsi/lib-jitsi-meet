export = TranscriptionService;
declare class TranscriptionService {
    send(recordingResult: any, callback: Function): void;
    sendRequest(audioBlob: Blob, callback: Function): never;
    formatResponse(response: any): Array<any>;
    verify(response: any): boolean;
}
