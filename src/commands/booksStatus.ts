import { printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchBookProgress, fetchNotebookList } from '../lib/wereadClient.js';

export type BooksStatusOptions = {
  vid?: string;
  skey?: string;
  json?: boolean;
};

type ProgressShape = {
  book?: {
    progress?: number;
    finishTime?: number;
    startReadingTime?: number;
  };
};

export async function runBooksStatus(options: BooksStatusOptions): Promise<void> {
  const auth = await resolveAuth(options);

  const books = await fetchNotebookList(auth.vid, auth.skey);
  const results: Array<{
    bookId: string;
    title: string;
    progress: number | null;
    finishTime: number | null;
    startReadingTime: number | null;
  }> = [];

  const concurrency = 6;
  for (let index = 0; index < books.length; index += concurrency) {
    const chunk = books.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (book) => {
        const progress = (await fetchBookProgress(
          auth.vid,
          auth.skey,
          book.book.bookId
        )) as ProgressShape;

        return {
          bookId: book.book.bookId,
          title: book.book.title,
          progress: progress.book?.progress ?? null,
          finishTime: progress.book?.finishTime ?? null,
          startReadingTime: progress.book?.startReadingTime ?? null
        };
      })
    );
    results.push(...chunkResults);
  }

  const finished = results.filter((item) => item.finishTime && item.finishTime > 0);
  const reading = results.filter(
    (item) => item.progress !== null && item.progress > 0 && item.progress < 100 && !item.finishTime
  );
  const unreadOrUnknown = results.filter((item) => item.progress === null && !item.finishTime);

  const payload = {
    ok: true,
    total: results.length,
    finishedCount: finished.length,
    readingCount: reading.length,
    unreadOrUnknownCount: unreadOrUnknown.length,
    finishedSample: finished.slice(0, 10),
    readingSample: reading.slice(0, 10)
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  printText(JSON.stringify(payload, null, 2));
}
