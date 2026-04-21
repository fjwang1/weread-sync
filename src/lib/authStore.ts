import { getAppPaths } from './appPaths.js';
import { readJsonFile, removeFile, writeJsonFile } from './fileStore.js';

export type StoredAuth = {
  webLoginVid: string;
  accessToken: string;
  refreshToken?: string;
  loginAt: string;
  userInfo?: unknown;
};

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  return readJsonFile<StoredAuth>(getAppPaths().authFile);
}

export async function saveStoredAuth(auth: StoredAuth): Promise<void> {
  await writeJsonFile(getAppPaths().authFile, auth);
}

export async function clearStoredAuth(): Promise<void> {
  await removeFile(getAppPaths().authFile);
}
