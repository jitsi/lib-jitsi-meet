import JitsiTrackError from '../../JitsiTrackError';

declare namespace ScreenObtainer {
  const obtainStream: (() => Promise<MediaStream>) | null;
  const init: (options?: {
    desktopSharingFrameRate?: { min: number; max: number };
    desktopSharingResolution?: { width?: { min?: number; max?: number }; height?: { min?: number; max?: number } };
    desktopSharingSources?: string[];
    audioQuality?: { stereo?: boolean };
    screenShareSettings?: {
      desktopPreferCurrentTab?: boolean;
      desktopSystemAudio?: 'include' | 'exclude';
      desktopSurfaceSwitching?: 'include' | 'exclude';
      desktopDisplaySurface?: string;
      desktopSelfBrowserSurface?: 'include' | 'exclude';
    };
  }) => void;
  const isSupported: () => boolean;
  const _getAudioConstraints: () => object | boolean;
  const _getDesktopMedia: (options: object) => Promise<MediaStream>;
  const _getUserMedia: (umDevices: string[], constraints: object, timeout: number) => Promise<MediaStream>;
  const _getMissingTracks: (requestedDevices: string[], stream: MediaStream) => string[];
  const _onMediaDevicesListChanged: () => void;
  const _updateKnownDevices: (devices: object[]) => void;
  const _updateGrantedPermissions: (um: object, stream: object) => void;
  const _createObtainStreamMethod: () => (() => Promise<MediaStream>) | null;
  const obtainScreenOnElectron: (
    onSuccess: (result: { stream: MediaStream; sourceId: string; sourceType: string }) => void,
    onFailure: (err: JitsiTrackError) => void,
    options?: object
  ) => void;
  const obtainScreenFromGetDisplayMedia: (
    callback: (result: { stream: MediaStream; sourceId: string }) => void,
    errorCallback: (err: JitsiTrackError) => void
  ) => void;
  const obtainScreenFromGetDisplayMediaRN: (
    callback: (result: { stream: MediaStream; sourceId: string }) => void,
    errorCallback: (err: JitsiTrackError) => void
  ) => void;
  const setContentHint: (stream: MediaStream) => void;
  const setDesktopSharingFrameRate: (maxFps: number) => void;
}

export default ScreenObtainer;
