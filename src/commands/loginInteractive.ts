import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

import { saveStoredAuth } from '../lib/authStore.js';
import { CliError, printJson, printText } from '../lib/output.js';
import { fetchUserInfo, getConfirmUrl, getLoginUid, waitForLogin } from '../lib/wereadClient.js';

export type LoginInteractiveOptions = {
  json?: boolean;
  qrOut?: string;
};

export async function runLoginInteractive(options: LoginInteractiveOptions): Promise<void> {
  // Step 1: get uid and generate QR
  const uidResult = await getLoginUid();
  if (!uidResult.uid) {
    throw new CliError('Missing uid from login response', 'UID_MISSING');
  }

  const confirmUrl = getConfirmUrl(uidResult.uid);
  const qrOut = options.qrOut ?? path.resolve(process.cwd(), 'tmp', `weread-login-${uidResult.uid}.png`);

  await fs.mkdir(path.dirname(qrOut), { recursive: true });
  await QRCode.toFile(qrOut, confirmUrl, {
    type: 'png',
    width: 320,
    margin: 2
  });

  // In terminal, also print the QR as text
  const qrText = await QRCode.toString(confirmUrl, { type: 'terminal', small: true });

  if (options.json) {
    printJson({ ok: true, step: 'waiting', uid: uidResult.uid, qrPath: qrOut });
  } else {
    printText(qrText);
    printText(`二维码已保存到：${qrOut}`);
    printText('请用微信扫码登录，等待中...');
  }

  // Step 2: poll for login result
  const result = await waitForLogin(uidResult.uid, undefined, 120_000);
  const loggedIn = Boolean(result.succeed && result.webLoginVid && result.accessToken);

  if (!loggedIn) {
    if (options.json) {
      printJson({ ok: true, loggedIn: false, reason: result.logicCode ?? 'timeout' });
    } else {
      printText('登录超时或未确认，请重试。');
    }
    return;
  }

  // Step 3: save auth
  const webLoginVid = String(result.webLoginVid);
  const accessToken = String(result.accessToken);
  let userInfo: unknown;
  try {
    userInfo = await fetchUserInfo(webLoginVid, accessToken);
  } catch {
    userInfo = undefined;
  }

  const loginAt = new Date().toISOString();
  await saveStoredAuth({
    webLoginVid,
    accessToken,
    refreshToken: result.refreshToken ? String(result.refreshToken) : undefined,
    loginAt,
    userInfo
  });

  if (options.json) {
    printJson({ ok: true, loggedIn: true, vid: webLoginVid, loginAt });
  } else {
    printText(`登录成功，vid: ${webLoginVid}`);
  }
}
