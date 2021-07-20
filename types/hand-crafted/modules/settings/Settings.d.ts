declare namespace Settings {
  export function init( externalStorage: Storage | undefined ): void;
  const callStatsUserName: string;
  const machineId: string;
  const sessionId: string;
}

export default Settings;