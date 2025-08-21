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
