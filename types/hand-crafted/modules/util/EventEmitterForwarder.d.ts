declare function EventEmitterForwarder( src: { addListener: ( params: unknown ) => unknown }, dest: { emit: ( params: unknown ) => void } ): void;

declare class EventEmitterForwarder {
  constructor( src: { addListener: ( params: unknown ) => unknown }, dest: { emit: ( params: unknown ) => void } ); // TODO:
  forward: ( srcEvent: string, dstyEvent: string, ...args: any[] ) => void;
}

export = EventEmitterForwarder;
