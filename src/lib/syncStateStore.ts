import { getAppPaths } from './appPaths.js';
import { readJsonFile, writeJsonFile } from './fileStore.js';

export type SyncStateBook = {
  title: string;
  author?: string;
  fingerprint: string;
  exportFile: string;
  status: string;
  progress: number | null;
  finishTime: number | null;
  noteCount?: number;
  reviewCount?: number;
  coverUrl?: string | null;
  coverPath?: string | null;
  coverCheckedAt?: string;
  syncedAt: string;
};

export type SyncState = {
  updatedAt: string;
  outputDir: string;
  includeStatuses: string[];
  books: Record<string, SyncStateBook>;
};

export type LastSyncResult = {
  ok: boolean;
  syncedAt: string;
  totalBooks: number;
  consideredBooks: number;
  syncedBooks: number;
  skippedBooks: number;
  outputDir: string;
  includeStatuses: string[];
  updated: Array<{
    bookId: string;
    title: string;
    filePath: string;
    status: string;
  }>;
};

export async function loadSyncState(): Promise<SyncState | null> {
  return readJsonFile<SyncState>(getAppPaths().syncStateFile);
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await writeJsonFile(getAppPaths().syncStateFile, state);
}

export async function loadLastSyncResult(): Promise<LastSyncResult | null> {
  return readJsonFile<LastSyncResult>(getAppPaths().lastResultFile);
}

export async function saveLastSyncResult(result: LastSyncResult): Promise<void> {
  await writeJsonFile(getAppPaths().lastResultFile, result);
}
