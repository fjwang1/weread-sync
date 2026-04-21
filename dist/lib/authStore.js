import { getAppPaths } from './appPaths.js';
import { readJsonFile, removeFile, writeJsonFile } from './fileStore.js';
export async function loadStoredAuth() {
    return readJsonFile(getAppPaths().authFile);
}
export async function saveStoredAuth(auth) {
    await writeJsonFile(getAppPaths().authFile, auth);
}
export async function clearStoredAuth() {
    await removeFile(getAppPaths().authFile);
}
