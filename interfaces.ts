export interface ICreateLocalTrackOptions {
    cameraDeviceId?: string;
    devices?: any[];
    firePermissionPromptIsShownEvent?: boolean;
    fireSlowPromiseEvent?: boolean;
    micDeviceId?: string;
    resolution?: string;
}

export interface IJitsiMeetJS {
    analytics: unknown;
}

export interface IJitsiMeetJSOptions {
    enableAnalyticsLogging?: boolean;
    enableUnifiedOnChrome?: boolean;
    enableWindowOnErrorHandler?: boolean;
    externalStorage?: Storage;
    flags?: {
        enableUnifiedOnChrome?: boolean;
    }
}
