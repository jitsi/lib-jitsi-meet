import JitsiConference from '../../JitsiConference';

export default function ComponentsVersions( conference: JitsiConference ): void;

export default class ComponentsVersions {
  constructor( conference: JitsiConference );
  processVersions: ( versions: unknown, mucResource: never, mucJid: string ) => void; // TODO:
  getComponentVersion: ( componentName: string ) => string;
}
