import { saveStoredAuth } from '../lib/authStore.js';
import { fetchUserInfo, waitForLogin } from '../lib/wereadClient.js';
import { CliError, printJson, printText } from '../lib/output.js';

export type LoginWaitOptions = {
  uid?: string;
  otp?: string;
  timeoutMs?: string;
  json?: boolean;
};

export async function runLoginWait(options: LoginWaitOptions): Promise<void> {
  if (!options.uid) {
    throw new CliError('login wait requires --uid', 'UID_REQUIRED');
  }

  const timeoutMs = Number(options.timeoutMs ?? 65_000);
  const result = await waitForLogin(options.uid, options.otp, timeoutMs);

  if (result.succeed && result.webLoginVid && result.accessToken) {
    const webLoginVid = String(result.webLoginVid);
    const accessToken = String(result.accessToken);
    let userInfo: unknown;
    try {
      userInfo = await fetchUserInfo(webLoginVid, accessToken);
    } catch {
      userInfo = undefined;
    }

    await saveStoredAuth({
      webLoginVid,
      accessToken,
      refreshToken: result.refreshToken ? String(result.refreshToken) : undefined,
      loginAt: new Date().toISOString(),
      userInfo
    });
  }

  const payload = {
    ok: true,
    result
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  printText(JSON.stringify(payload, null, 2));
}
