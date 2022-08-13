import JitsiTrackError from '../../JitsiTrackError';

declare namespace ScreenObtainer {
  const obtainStream: unknown, // TODO:
  init: ( options: unknown ) => void, // TODO:
  isSupported: () => boolean,
  obtainScreenOnElectron: ( onSuccess: () => unknown, onFailure: ( err: JitsiTrackError ) => unknown, options?: unknown ) => void, // TODO:
  obtainScreenFromGetDisplayMedia: ( callback: () => unknown, errorCallback: () => unknown ) => void, // TODO:
  obtainScreenFromGetDisplayMediaRN: ( callback: () => unknown, errorCallback: ( err: JitsiTrackError ) => unknown ) => void, // TODO:
  setDesktopSharingFrameRate: (maxFps: number) => void
}

export default ScreenObtainer;
