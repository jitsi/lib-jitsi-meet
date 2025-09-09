export interface ISsrcGroupInfo {
    semantics: string;
    ssrcs: number[];
}
export interface ISsrcInfo {
    groups: Array<ISsrcGroupInfo>;
    msid: string;
    ssrcs: Array<number>;
}

export interface IICECandidate {
    component: string;
    foundation: string;
    generation?: string;
    hasOwnAttribute?: (attr: string) => boolean;
    id?: string;
    ip: string;
    network?: string;
    port: string;
    priority: string;
    protocol: string;
    'rel-addr'?: string;
    'rel-port'?: string;
    tcptype?: string;
    type: string;
}

export interface IMediaLine {
    fmt: string[];
    media: string;
    port: string;
    proto: string;
}

export interface ICryptoData {
    'crypto-suite': string;
    'key-params': string;
    'session-params'?: string;
    tag: string;
}

export interface IExtmapData {
    direction: string;
    params: string[];
    uri: string;
    value: string;
}

export interface IFingerprintData {
    fingerprint: string;
    hash: string;
    required: boolean;
}

export interface IFmtpParameter {
    name: string;
    value: string;
}

export interface IRTCPFBData {
    params: string[];
    pt: string;
    type: string;
}

export interface IRTPMapData {
    channels: string;
    clockrate: string;
    id: string;
    name: string;
}

export interface ISSRCGroupData {
    semantics: string;
    ssrcs: string[];
}

export interface IICEParams {
    pwd: string;
    ufrag: string;
    xmlns?: string;
}

export interface IRTPInfo {
    codec?: string;
    payload: number;
}

export interface IFMTPInfo {
    config: string;
    payload: number;
}
