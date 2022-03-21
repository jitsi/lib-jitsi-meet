export declare type Resolution = {
    width: number;
    height: number;
};
declare const _resolutions: {
    '2160': {
        width: number;
        height: number;
    };
    '4k': {
        width: number;
        height: number;
    };
    '1080': {
        width: number;
        height: number;
    };
    fullhd: {
        width: number;
        height: number;
    };
    '720': {
        width: number;
        height: number;
    };
    hd: {
        width: number;
        height: number;
    };
    '540': {
        width: number;
        height: number;
    };
    qhd: {
        width: number;
        height: number;
    };
    '480': {
        width: number;
        height: number;
    };
    vga: {
        width: number;
        height: number;
    };
    '360': {
        width: number;
        height: number;
    };
    '240': {
        width: number;
        height: number;
    };
    '180': {
        width: number;
        height: number;
    };
};
export declare type Resolutions = keyof typeof _resolutions;
declare type ResolutionMap = {
    +readonly [Property in Resolutions]: Resolution;
};
export declare const resolutions: ResolutionMap;
export {};
