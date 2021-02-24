import JitsiTrackError from '../../JitsiTrackError';

declare namespace ScreenObtainer {
  const obtainStream: unknown, // TODO:
  init: ( options: unknown, gum: unknown ) => void, // TODO:
  isSupported: () => boolean,
  obtainScreenOnElectron: ( options: { desktopSharingSources: string[] }, onSuccess: () => unknown, onFailure: ( err: JitsiTrackError ) => unknown ) => void, // TODO:
  obtainScreenFromGetDisplayMedia: ( options: unknown, callback: () => unknown, errorCallback: () => unknown ) => void, // TODO:
  obtainScreenFromGetDisplayMediaRN: ( options: unknown, callback: () => unknown, errorCallback: ( err: JitsiTrackError ) => unknown ) => void // TODO:
}

export default ScreenObtainer;