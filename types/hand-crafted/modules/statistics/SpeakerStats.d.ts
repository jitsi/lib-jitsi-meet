export class SpeakerStats {
  constructor( userId: string, displayName: string, isLocalStats: boolean );
  getUserId: () => string;
  getDisplayName: () => string;
  setDisplayName: ( name: string ) => void;
  isLocalStats: () => boolean;
  isDominantSpeaker: () => boolean;
  setDominantSpeaker: ( isNowDominantSpeaker: boolean ) => void;
  getTotalDominantSpeakerTime: () => number;
  hasLeft: () => boolean;
  markAsHasLeft: () => void;
}
