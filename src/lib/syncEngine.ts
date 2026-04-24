import fs from 'node:fs/promises';
import path from 'node:path';

import { getAppPaths } from './appPaths.js';
import { resolveAuth } from './authResolver.js';
import { cacheBookCover, extractBookCoverUrl } from './coverCache.js';
import { ensureDir } from './fileStore.js';
import { renderBookMarkdown } from './markdown.js';
import { CliError } from './output.js';
import {
  fetchBookInfo,
  fetchBookmarkList,
  fetchBookProgress,
  fetchNotebookList,
  fetchReviewList
} from './wereadClient.js';
import {
  loadLastSyncResult,
  loadSyncState,
  saveLastSyncResult,
  saveSyncState,
  type LastSyncResult,
  type SyncState
} from './syncStateStore.js';
import { classifyReadingStatus, type ReadingStatus } from './statusFilter.js';

type SyncBookProgress = {
  book?: {
    progress?: number;
    finishTime?: number;
    startReadingTime?: number;
  };
};

type SyncOptions = {
  vid?: string;
  skey?: string;
  includeStatuses: ReadingStatus[];
  outputDir?: string;
  force?: boolean;
  bookId?: string;
};

type SyncCandidate = {
  bookId: string;
  title: string;
  author?: string;
  bookMeta: Record<string, unknown>;
  noteCount: number;
  reviewCount: number;
  sort: number;
  progress: number | null;
  finishTime: number | null;
  status: ReadingStatus;
};

type SyncAuth = {
  vid: string;
  skey: string;
};

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFingerprint(candidate: SyncCandidate): string {
  return [
    candidate.noteCount,
    candidate.reviewCount,
    candidate.sort,
    candidate.status,
    candidate.progress ?? '',
    candidate.finishTime ?? ''
  ].join(':');
}

function resolveOutputDir(outputDir?: string): string {
  if (outputDir) {
    return path.resolve(outputDir);
  }

  return getAppPaths().exportsDir;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function pathExists(filePath?: string | null): Promise<boolean> {
  if (!filePath) {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cacheCoverForSkippedBook(input: {
  auth: { vid: string; skey: string };
  candidate: SyncCandidate;
  previous: SyncState['books'][string];
  checkedAt: string;
}): Promise<SyncState['books'][string]> {
  const sourceCoverUrl = extractBookCoverUrl(input.candidate.bookMeta) ?? input.previous.coverUrl;
  const coverSource = sourceCoverUrl
    ? { ...input.candidate.bookMeta, cover: sourceCoverUrl }
    : {
        ...input.candidate.bookMeta,
        ...asRecord(await fetchBookInfo(input.auth.vid, input.auth.skey, input.candidate.bookId))
      };
  const cover = await cacheBookCover(input.candidate.bookId, coverSource);

  return {
    ...input.previous,
    title: input.candidate.title,
    author: input.previous.author ?? input.candidate.author,
    status: input.candidate.status,
    progress: input.candidate.progress,
    finishTime: input.candidate.finishTime,
    noteCount: input.candidate.noteCount,
    reviewCount: input.candidate.reviewCount,
    coverUrl: cover.coverUrl ?? input.previous.coverUrl ?? null,
    coverPath: cover.coverPath ?? input.previous.coverPath ?? null,
    coverCheckedAt: input.checkedAt
  };
}

async function collectCandidates(options: SyncOptions, auth: SyncAuth): Promise<SyncCandidate[]> {
  const notebookEntries = await fetchNotebookList(auth.vid, auth.skey);
  const filteredEntries = options.bookId
    ? notebookEntries.filter((entry) => entry.book.bookId === options.bookId)
    : notebookEntries;

  if (options.bookId && filteredEntries.length === 0) {
    throw new CliError(`Book ${options.bookId} not found in notebook list`, 'BOOK_NOT_FOUND');
  }

  const candidates: SyncCandidate[] = [];
  const concurrency = 6;

  for (let index = 0; index < filteredEntries.length; index += concurrency) {
    const chunk = filteredEntries.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (entry) => {
        const progress = (await fetchBookProgress(
          auth.vid,
          auth.skey,
          entry.book.bookId
        )) as SyncBookProgress;

        const readingProgress = progress.book?.progress ?? null;
        const finishTime = progress.book?.finishTime ?? null;
        const status = classifyReadingStatus(readingProgress, finishTime);

        return {
          bookId: entry.book.bookId,
          title: entry.book.title,
          author: entry.book.author,
          bookMeta: asRecord(entry.book),
          noteCount: entry.noteCount,
          reviewCount: entry.reviewCount,
          sort: entry.sort,
          progress: readingProgress,
          finishTime,
          status
        };
      })
    );

    candidates.push(...chunkResults);
  }

  return candidates.filter((candidate) => options.includeStatuses.includes(candidate.status));
}

export async function runSync(options: SyncOptions): Promise<LastSyncResult> {
  const auth = await resolveAuth(options);
  const outputDir = resolveOutputDir(options.outputDir);
  await ensureDir(outputDir);

  const allCandidates = await collectCandidates(options, auth);
  const existingState = (await loadSyncState()) ?? {
    updatedAt: '',
    outputDir,
    includeStatuses: options.includeStatuses,
    books: {}
  };

  const nextState: SyncState = {
    updatedAt: new Date().toISOString(),
    outputDir,
    includeStatuses: options.includeStatuses,
    books: { ...existingState.books }
  };

  const updated: LastSyncResult['updated'] = [];
  let skippedBooks = 0;

  for (const candidate of allCandidates) {
    const fingerprint = buildFingerprint(candidate);
    const previous = existingState.books[candidate.bookId];
    const hasDemoMetadata =
      previous &&
      typeof previous.noteCount === 'number' &&
      typeof previous.reviewCount === 'number' &&
      typeof previous.coverCheckedAt === 'string';
    const hasCachedCover = await pathExists(previous?.coverPath);
    const hasRemoteCoverHint = Boolean(extractBookCoverUrl(candidate.bookMeta) ?? previous?.coverUrl);
    const coverIsResolved = hasCachedCover || (hasDemoMetadata && !hasRemoteCoverHint);

    if (!options.force && previous?.fingerprint === fingerprint && hasDemoMetadata && coverIsResolved) {
      skippedBooks += 1;
      continue;
    }

    if (!options.force && previous?.fingerprint === fingerprint && hasDemoMetadata && !coverIsResolved) {
      nextState.books[candidate.bookId] = await cacheCoverForSkippedBook({
        auth,
        candidate,
        previous,
        checkedAt: nextState.updatedAt
      });
      skippedBooks += 1;
      continue;
    }

    const [bookInfo, progress, bookmarks, reviews] = await Promise.all([
      fetchBookInfo(auth.vid, auth.skey, candidate.bookId),
      fetchBookProgress(auth.vid, auth.skey, candidate.bookId),
      fetchBookmarkList(auth.vid, auth.skey, candidate.bookId),
      fetchReviewList(auth.vid, auth.skey, candidate.bookId)
    ]);

    const bookInfoRecord = {
      ...candidate.bookMeta,
      ...asRecord(bookInfo)
    };
    const cover = await cacheBookCover(candidate.bookId, bookInfoRecord);
    const enrichedBookInfo = {
      ...bookInfoRecord,
      coverUrl: cover.coverUrl ?? readString(bookInfoRecord.coverUrl) ?? readString(bookInfoRecord.cover)
    };

    const markdown = renderBookMarkdown({
      syncedAt: nextState.updatedAt,
      bookInfo: enrichedBookInfo,
      progress: progress as Record<string, unknown>,
      bookmarks: bookmarks as Record<string, unknown>,
      reviews: reviews as Record<string, unknown>,
      status: candidate.status,
      noteCount: candidate.noteCount,
      reviewCount: candidate.reviewCount
    });

    const fileName = `${sanitizeFileName(candidate.title)}__${candidate.bookId}.md`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, markdown, 'utf8');

    nextState.books[candidate.bookId] = {
      title: candidate.title,
      author: readString(bookInfoRecord.author) ?? candidate.author,
      fingerprint,
      exportFile: filePath,
      status: candidate.status,
      progress: candidate.progress,
      finishTime: candidate.finishTime,
      noteCount: candidate.noteCount,
      reviewCount: candidate.reviewCount,
      coverUrl: cover.coverUrl,
      coverPath: cover.coverPath,
      coverCheckedAt: nextState.updatedAt,
      syncedAt: nextState.updatedAt
    };

    updated.push({
      bookId: candidate.bookId,
      title: candidate.title,
      filePath,
      status: candidate.status
    });
  }

  await saveSyncState(nextState);

  const result: LastSyncResult = {
    ok: true,
    syncedAt: nextState.updatedAt,
    totalBooks: allCandidates.length,
    consideredBooks: allCandidates.length,
    syncedBooks: updated.length,
    skippedBooks,
    outputDir,
    includeStatuses: options.includeStatuses,
    updated
  };

  await saveLastSyncResult(result);
  return result;
}

export async function getStatus(options: { outputDir?: string }): Promise<{
  outputDir: string;
  lastResult: LastSyncResult | null;
  syncState: SyncState | null;
}> {
  const syncState = await loadSyncState();
  const lastResult = await loadLastSyncResult();

  return {
    outputDir:
      options.outputDir ? resolveOutputDir(options.outputDir) : syncState?.outputDir ?? lastResult?.outputDir ?? resolveOutputDir(),
    lastResult,
    syncState
  };
}
