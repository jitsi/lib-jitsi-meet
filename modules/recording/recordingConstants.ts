export interface IRecordingConstants {
    error: {
        BUSY: string;
        ERROR: string;
        POLICY_VIOLATION: string;
        RESOURCE_CONSTRAINT: string;
        SERVICE_UNAVAILABLE: string;
        UNEXPECTED_REQUEST: string;
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
        SERVICE_UNAVAILABLE: 'service-unavailable',
        UNEXPECTED_REQUEST: 'unexpected-request'
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
