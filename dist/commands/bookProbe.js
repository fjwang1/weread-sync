import { CliError, printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchBookInfo, fetchBookmarkList, fetchBookProgress, fetchChapterInfos, fetchReviewList } from '../lib/wereadClient.js';
export async function runBookProbe(options) {
    if (!options.bookId) {
        throw new CliError('book-probe requires --book-id', 'ARGS_REQUIRED');
    }
    const auth = await resolveAuth(options);
    const [info, progress, bookmarks, reviews, chapters] = await Promise.all([
        fetchBookInfo(auth.vid, auth.skey, options.bookId),
        fetchBookProgress(auth.vid, auth.skey, options.bookId),
        fetchBookmarkList(auth.vid, auth.skey, options.bookId),
        fetchReviewList(auth.vid, auth.skey, options.bookId),
        fetchChapterInfos(auth.vid, auth.skey, options.bookId)
    ]);
    const payload = {
        ok: true,
        bookId: options.bookId,
        info,
        progress,
        bookmarks,
        reviews,
        chapters
    };
    if (options.json) {
        printJson(payload);
        return;
    }
    printText(JSON.stringify(payload, null, 2));
}
