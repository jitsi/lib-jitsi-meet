export default class BrowserCapabilities {
  doesVideoMuteByStreamRemove: () => boolean;
  isWebKitBased: () => boolean;
  isChromiumBased: () => boolean;
  isTwa: () => boolean;
  isSupported: () => boolean;
  isUserInteractionRequiredForUnmute: () => boolean;
  supportsVideoMuteOnConnInterrupted: () => boolean;
  supportsBandwidthStatistics: () => boolean;
  supportsCodecPreferences: () => boolean;
  supportsDeviceChangeEvent: () => boolean;
  supportsLocalCandidateRttStatistics: () => boolean;
  supportsPerformanceObserver: () => boolean;
  supportsReceiverStats: () => boolean;
  supportsRTTStatistics: () => boolean;
  usesPlanB: () => boolean;
  usesSdpMungingForSimulcast: () => boolean;
  usesUnifiedPlan: () => boolean;
  usesAdapter: () => boolean;
  usesRidsForSimulcast: () => boolean;
  supportsGetDisplayMedia: () => boolean;
  supportsInsertableStreams: () => boolean;
  supportsAudioRed: () => boolean;
  supportsSdpSemantics: () => boolean;
}
