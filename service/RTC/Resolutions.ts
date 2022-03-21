export type Resolution = {
    width: number;
    height: number;
}

const _resolutions = {
    '2160': {
        width: 3840,
        height: 2160
    },
    '4k': {
        width: 3840,
        height: 2160
    },
    '1080': {
        width: 1920,
        height: 1080
    },
    'fullhd': {
        width: 1920,
        height: 1080
    },
    '720': {
        width: 1280,
        height: 720
    },
    'hd': {
        width: 1280,
        height: 720
    },
    '540': {
        width: 960,
        height: 540
    },
    'qhd': {
        width: 960,
        height: 540
    },
    '480': {
        width: 640,
        height: 480
    },
    'vga': {
        width: 640,
        height: 480
    },
    '360': {
        width: 640,
        height: 360
    },
    '240': {
        width: 320,
        height: 240
    },
    '180': {
        width: 320,
        height: 180
    }
};

export type Resolutions = keyof typeof _resolutions;

type ResolutionMap = {
    +readonly [ Property in Resolutions ]: Resolution;
};

// this is here to ensure that all members of the resolutions constant are of type Resolution
export const resolutions: ResolutionMap = _resolutions;
