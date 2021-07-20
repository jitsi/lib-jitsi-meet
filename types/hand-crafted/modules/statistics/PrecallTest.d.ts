export function init( options: unknown ): Promise<void>; // TODO:

export type PrecallTestOptions = {
  callStatsID: string;
  callStatsSecret: string;
  statisticsId: string;
  statisticsDisplayName: string;
  disableThirdPartyRequests?: boolean; // undocumented but used in the method
}

export type PrecallTestResults = {
  mediaConnectivity: boolean
  throughput: number;
  fractionalLoss: number;
  rtt: number;
  provider: string;
}

export default class PrecallTest {
  init: ( options: PrecallTestOptions ) => Promise<void>;
  execute: () => Promise<string | PrecallTestResults>;
}
