import JitsiConnectionErrors from '../../JitsiConnectionErrors';

export default function authenticateAndUpgradeRole( options: { id: string, password: string, roomPassword?: string, onLoginSuccessful?: ( params: unknown ) => unknown } ): unknown;

export type UpgradeRoleError = {
  connectionError?: JitsiConnectionErrors,
  authenticationError?: string;
  message?: string;
  credentials?: {
    jid: string,
    password: string
  }
}