export default class AudioMixer {
  addMediaStream: ( stream: MediaStream ) => void;
  start: () => MediaStream;
  reset: () => void;
}
