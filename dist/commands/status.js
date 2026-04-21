import { loadStoredAuth } from '../lib/authStore.js';
import { printJson, printText } from '../lib/output.js';
import { getStatus } from '../lib/syncEngine.js';
export async function runStatus(options) {
    const auth = await loadStoredAuth();
    const syncStatus = await getStatus({
        outputDir: options.outputDir
    });
    const payload = {
        ok: true,
        loggedIn: Boolean(auth),
        userVid: auth?.webLoginVid ?? null,
        loginAt: auth?.loginAt ?? null,
        outputDir: syncStatus.outputDir,
        lastSyncAt: syncStatus.lastResult?.syncedAt ?? null,
        lastSync: syncStatus.lastResult
    };
    if (options.json) {
        printJson(payload);
        return;
    }
    printText(`登录状态：${payload.loggedIn ? '已登录' : '未登录'}`);
    printText(`用户：${payload.userVid ?? ''}`);
    printText(`导出目录：${payload.outputDir}`);
    printText(`上次同步：${payload.lastSyncAt ?? '无'}`);
}
