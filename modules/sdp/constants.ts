import { MediaType } from '../../service/RTC/MediaType';

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
    media: string | MediaType;
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
    setup?: string;
    xmlns?: string;
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

export interface IMediaInfo {
    mediaType: MediaType;
    mediaindex: number;
    mid: string;
    ssrcGroups: ISsrcGroup[];
    ssrcs: { [ssrc: string]: IMediaSsrc; };
}

export interface IMediaSsrc {
    lines: string[];
    ssrc: string;
}

export interface ISsrcGroup {
    semantics: string;
    ssrcs: string[];
}

export interface IMediaSource {
    mediaType: string;
    mid?: string;
    ssrcGroups: ISsrcGroup[];
    ssrcs: { [ssrcNum: string]: IMediaSsrc; };
}

export interface IDiffSourceInfo {
    [index: string]: IMediaSource;
}
