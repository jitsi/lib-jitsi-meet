export interface ISsrcGroupInfo {
    semantics: string;
    ssrcs: number[];
}

export interface ISsrcInfo {
    groups: Array<ISsrcGroupInfo>;
    msid: string;
    ssrcs: Array<number>;
}

export interface ISsrcAttribute {
    attribute: string;
    id: number;
    value: string;
}

export interface IICECandidate {
    foundation: string;
    component: string;
    protocol: string;
    priority: string;
    ip: string;
    port: string;
    type: string;
    'rel-addr'?: string;
    'rel-port'?: string;
    generation?: string;
    tcptype?: string;
    network?: string;
    id?: string;
    hasOwnAttribute?: (attr: string) => boolean;
}

export interface IMediaLine {
    media: string;
    port: string;
    proto: string;
    fmt: string[];
}

export interface ICryptoData {
    tag: string;
    'crypto-suite': string;
    'key-params': string;
    'session-params'?: string;
}

export interface IExtmapData {
    value: string;
    direction: string;
    uri: string;
    params: string[];
}

export interface IFingerprintData {
    hash: string;
    fingerprint: string;
}

export interface IFmtpParameter {
    name: string;
    value: string;
}

export interface IRTCPFBData {
    pt: string;
    type: string;
    params: string[];
}

export interface IRTPMapData {
    id: string;
    name: string;
    clockrate: string;
    channels: string;
}

export interface ISSRCGroupData {
    semantics: string;
    ssrcs: string[];
}

export interface IICEParams {
    pwd: string;
    ufrag: string;
}

export interface ISDPObject {
    media: IMediaDescription[];
}

export interface IMediaDescription {
    type: string;
}

export interface IMLine {
    msid?: string;
    media?: string;
    ssrcs?: ISsrcAttribute[];
    ssrcGroups?: ISsrcGroups[];
    rtp?: IRTPInfo[];
    fmtp?: IFMTPInfo[];
    rtcpFb?: IRTPInfo[];
    payloads: string | number;
    port?: number;
    direction?: string;
    type?: string;
}

export interface IRTPInfo {
    codec?: string;
    payload: number;
}

export interface IFMTPInfo {
    payload: number;
    config: string;
}

export interface ISsrcGroups {
    semantics: string;
    ssrcs: string;
}
