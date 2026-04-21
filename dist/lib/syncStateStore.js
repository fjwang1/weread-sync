import { getAppPaths } from './appPaths.js';
import { readJsonFile, writeJsonFile } from './fileStore.js';
export async function loadSyncState() {
    return readJsonFile(getAppPaths().syncStateFile);
}
export async function saveSyncState(state) {
    await writeJsonFile(getAppPaths().syncStateFile, state);
}
export async function loadLastSyncResult() {
    return readJsonFile(getAppPaths().lastResultFile);
}
export async function saveLastSyncResult(result) {
    await writeJsonFile(getAppPaths().lastResultFile, result);
}
