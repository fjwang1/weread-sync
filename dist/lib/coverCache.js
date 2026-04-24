import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppPaths } from './appPaths.js';
import { ensureDir } from './fileStore.js';
const COVER_KEYS = new Set([
    'cover',
    'coverUrl',
    'bookCover',
    'bookCoverUrl',
    'custom_cover',
    'custom_rec_cover'
]);
function normalizeCoverUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const absoluteUrl = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
        return absoluteUrl.replace('/s_', '/t7_');
    }
    return null;
}
function findCoverUrl(input, depth = 0) {
    if (!input || typeof input !== 'object' || depth > 4) {
        return null;
    }
    for (const [key, value] of Object.entries(input)) {
        if (COVER_KEYS.has(key) && typeof value === 'string') {
            const coverUrl = normalizeCoverUrl(value);
            if (coverUrl) {
                return coverUrl;
            }
        }
    }
    for (const value of Object.values(input)) {
        const coverUrl = findCoverUrl(value, depth + 1);
        if (coverUrl) {
            return coverUrl;
        }
    }
    return null;
}
function safeBookId(bookId) {
    return bookId.replace(/[^a-zA-Z0-9_-]/g, '-');
}
function extensionFromContentType(contentType) {
    if (!contentType) {
        return 'jpg';
    }
    if (contentType.includes('png')) {
        return 'png';
    }
    if (contentType.includes('webp')) {
        return 'webp';
    }
    if (contentType.includes('gif')) {
        return 'gif';
    }
    return 'jpg';
}
async function downloadCover(coverUrl, targetDir, bookId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(coverUrl, {
            headers: {
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            signal: controller.signal
        });
        if (!response.ok) {
            return null;
        }
        const contentType = response.headers.get('content-type');
        const extension = extensionFromContentType(contentType);
        const filePath = path.join(targetDir, `${safeBookId(bookId)}.${extension}`);
        const data = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(filePath, data);
        return filePath;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
export function extractBookCoverUrl(bookInfo) {
    return findCoverUrl(bookInfo);
}
export async function cacheBookCover(bookId, bookInfo) {
    const coverUrl = extractBookCoverUrl(bookInfo);
    if (!coverUrl) {
        return {
            coverUrl: null,
            coverPath: null
        };
    }
    const coverDir = path.join(getAppPaths().cacheDir, 'demo', 'covers');
    await ensureDir(coverDir);
    const coverPath = await downloadCover(coverUrl, coverDir, bookId);
    return {
        coverUrl,
        coverPath
    };
}
