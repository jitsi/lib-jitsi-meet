export function safeCounterIncrement( number: number ): number;

export function calculateAverage( valueArray: Float32Array ): number;

export function hashString( string: string ): number;

export function filterPositiveValues( valueArray: Float32Array ): Float32Array;

export class RunningAverage {
  constructor();
  addNext: ( value: number ) => void;
  getAverage: () => number;
}
