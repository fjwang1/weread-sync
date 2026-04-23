import { saveStoredAuth } from '../lib/authStore.js';
import { fetchUserInfo, waitForLogin } from '../lib/wereadClient.js';
import { CliError, printJson, printText } from '../lib/output.js';
export async function runLoginWait(options) {
    if (!options.uid) {
        throw new CliError('login wait requires --uid', 'UID_REQUIRED');
    }
    const timeoutMs = Number(options.timeoutMs ?? 65_000);
    const result = await waitForLogin(options.uid, options.otp, timeoutMs);
    const loggedIn = Boolean(result.succeed && result.webLoginVid && result.accessToken);
    if (loggedIn) {
        const webLoginVid = String(result.webLoginVid);
        const accessToken = String(result.accessToken);
        let userInfo;
        try {
            userInfo = await fetchUserInfo(webLoginVid, accessToken);
        }
        catch {
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
        const payload = {
            ok: true,
            loggedIn: true,
            vid: webLoginVid,
            loginAt
        };
        if (options.json) {
            printJson(payload);
            return;
        }
        printText(`登录成功，vid: ${webLoginVid}`);
        return;
    }
    const payload = {
        ok: true,
        loggedIn: false,
        reason: result.logicCode ?? 'unknown'
    };
    if (options.json) {
        printJson(payload);
        return;
    }
    printText(`登录未完成：${payload.reason}`);
}
