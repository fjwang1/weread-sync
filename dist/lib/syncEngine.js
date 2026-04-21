import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppPaths } from './appPaths.js';
import { resolveAuth } from './authResolver.js';
import { ensureDir } from './fileStore.js';
import { renderBookMarkdown } from './markdown.js';
import { CliError } from './output.js';
import { fetchBookInfo, fetchBookmarkList, fetchBookProgress, fetchChapterInfos, fetchNotebookList, fetchReviewList } from './wereadClient.js';
import { loadLastSyncResult, loadSyncState, saveLastSyncResult, saveSyncState } from './syncStateStore.js';
import { classifyReadingStatus } from './statusFilter.js';
function sanitizeFileName(fileName) {
    return fileName
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}
function buildFingerprint(candidate) {
    return [
        candidate.noteCount,
        candidate.reviewCount,
        candidate.sort,
        candidate.status,
        candidate.progress ?? '',
        candidate.finishTime ?? ''
    ].join(':');
}
function resolveOutputDir(outputDir) {
    if (outputDir) {
        return path.resolve(outputDir);
    }
    return getAppPaths().exportsDir;
}
async function collectCandidates(options) {
    const auth = await resolveAuth(options);
    const notebookEntries = await fetchNotebookList(auth.vid, auth.skey);
    const filteredEntries = options.bookId
        ? notebookEntries.filter((entry) => entry.book.bookId === options.bookId)
        : notebookEntries;
    if (options.bookId && filteredEntries.length === 0) {
        throw new CliError(`Book ${options.bookId} not found in notebook list`, 'BOOK_NOT_FOUND');
    }
    const candidates = [];
    const concurrency = 6;
    for (let index = 0; index < filteredEntries.length; index += concurrency) {
        const chunk = filteredEntries.slice(index, index + concurrency);
        const chunkResults = await Promise.all(chunk.map(async (entry) => {
            const progress = (await fetchBookProgress(auth.vid, auth.skey, entry.book.bookId));
            const readingProgress = progress.book?.progress ?? null;
            const finishTime = progress.book?.finishTime ?? null;
            const status = classifyReadingStatus(readingProgress, finishTime);
            return {
                bookId: entry.book.bookId,
                title: entry.book.title,
                noteCount: entry.noteCount,
                reviewCount: entry.reviewCount,
                sort: entry.sort,
                progress: readingProgress,
                finishTime,
                status
            };
        }));
        candidates.push(...chunkResults);
    }
    return candidates.filter((candidate) => options.includeStatuses.includes(candidate.status));
}
export async function runSync(options) {
    const auth = await resolveAuth(options);
    const outputDir = resolveOutputDir(options.outputDir);
    await ensureDir(outputDir);
    const allCandidates = await collectCandidates(options);
    const existingState = (await loadSyncState()) ?? {
        updatedAt: '',
        outputDir,
        includeStatuses: options.includeStatuses,
        books: {}
    };
    const nextState = {
        updatedAt: new Date().toISOString(),
        outputDir,
        includeStatuses: options.includeStatuses,
        books: { ...existingState.books }
    };
    const updated = [];
    let skippedBooks = 0;
    for (const candidate of allCandidates) {
        const fingerprint = buildFingerprint(candidate);
        const previous = existingState.books[candidate.bookId];
        if (!options.force && previous?.fingerprint === fingerprint) {
            skippedBooks += 1;
            continue;
        }
        const [bookInfo, progress, bookmarks, reviews, chapters] = await Promise.all([
            fetchBookInfo(auth.vid, auth.skey, candidate.bookId),
            fetchBookProgress(auth.vid, auth.skey, candidate.bookId),
            fetchBookmarkList(auth.vid, auth.skey, candidate.bookId),
            fetchReviewList(auth.vid, auth.skey, candidate.bookId),
            fetchChapterInfos(auth.vid, auth.skey, candidate.bookId)
        ]);
        void chapters;
        const markdown = renderBookMarkdown({
            syncedAt: nextState.updatedAt,
            bookInfo: bookInfo,
            progress: progress,
            bookmarks: bookmarks,
            reviews: reviews,
            status: candidate.status,
            noteCount: candidate.noteCount,
            reviewCount: candidate.reviewCount
        });
        const fileName = `${sanitizeFileName(candidate.title)}__${candidate.bookId}.md`;
        const filePath = path.join(outputDir, fileName);
        await fs.writeFile(filePath, markdown, 'utf8');
        nextState.books[candidate.bookId] = {
            title: candidate.title,
            fingerprint,
            exportFile: filePath,
            status: candidate.status,
            progress: candidate.progress,
            finishTime: candidate.finishTime,
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
    const result = {
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
export async function getStatus(options) {
    const syncState = await loadSyncState();
    const lastResult = await loadLastSyncResult();
    return {
        outputDir: options.outputDir ? resolveOutputDir(options.outputDir) : syncState?.outputDir ?? lastResult?.outputDir ?? resolveOutputDir(),
        lastResult,
        syncState
    };
}
