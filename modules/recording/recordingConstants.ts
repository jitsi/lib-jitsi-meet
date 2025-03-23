export interface IRecordingConstants {
    error: {
        BUSY: string;
        ERROR: string;
        POLICY_VIOLATION: string;
        RESOURCE_CONSTRAINT: string;
        UNEXPECTED_REQUEST: string;
        SERVICE_UNAVAILABLE: string;
    };
    mode: {
        FILE: string;
        STREAM: string;
    };
    status: {
        OFF: string;
        ON: string;
        PENDING: string;
    };
}

const recordingConstants: IRecordingConstants = {
    error: {
        BUSY: 'busy',
        ERROR: 'error',
        POLICY_VIOLATION: 'policy-violation',
        RESOURCE_CONSTRAINT: 'resource-constraint',
        UNEXPECTED_REQUEST: 'unexpected-request',
        SERVICE_UNAVAILABLE: 'service-unavailable'
    },
    mode: {
        FILE: 'file',
        STREAM: 'stream'
    },
    status: {
        OFF: 'off',
        ON: 'on',
        PENDING: 'pending'
    }
};

export default recordingConstants;
