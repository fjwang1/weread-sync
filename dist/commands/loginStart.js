import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { CliError, printJson, printText } from '../lib/output.js';
import { getConfirmUrl, getLoginUid } from '../lib/wereadClient.js';
export async function runLoginStart(options) {
    const result = await getLoginUid();
    if (!result.uid) {
        throw new CliError('Missing uid from login response', 'UID_MISSING');
    }
    const confirmUrl = getConfirmUrl(result.uid);
    const qrOut = options.qrOut ?? path.resolve(process.cwd(), 'tmp', `weread-login-${result.uid}.png`);
    await fs.mkdir(path.dirname(qrOut), { recursive: true });
    await QRCode.toFile(qrOut, confirmUrl, {
        type: 'png',
        width: 320,
        margin: 2
    });
    const payload = {
        ok: true,
        uid: result.uid,
        confirmUrl,
        qrPath: qrOut
    };
    if (options.json) {
        printJson(payload);
        return;
    }
    printText(`uid: ${payload.uid}`);
    printText(`confirmUrl: ${payload.confirmUrl}`);
    printText(`qrPath: ${payload.qrPath}`);
}
