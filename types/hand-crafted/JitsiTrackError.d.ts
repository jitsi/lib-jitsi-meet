export default function JitsiTrackError( error: unknown | string, options: unknown | string, devices: ( 'audio' | 'video' | 'desktop' | 'screen' | 'audiooutput' )[] ): void; // TODO:

export default class JitsiTrackError {
  constructor( error: unknown | string, options: unknown | string, devices: ( 'audio' | 'video' | 'desktop' | 'screen' | 'audiooutput' )[] ); // TODO:
  gum?: { error: Error, constraints: unknown, devices: ( 'audio' | 'video' | 'desktop' | 'screen' | 'audiooutput' )[] }; // TODO:
  name?: string;
  message?: string;
  stack: unknown[]; // TODO:
}
