import { printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchNotebookList } from '../lib/wereadClient.js';

export type NotebooksOptions = {
  vid?: string;
  skey?: string;
  json?: boolean;
};

type NotebookBookMeta = {
  bookId: string;
  title: string;
  type: number;
  noteCount: number;
  reviewCount: number;
  bookmarkCount: number;
  sort: number;
};

export async function runNotebooks(options: NotebooksOptions): Promise<void> {
  const auth = await resolveAuth(options);

  const books = (await fetchNotebookList(auth.vid, auth.skey)).map<NotebookBookMeta>((entry) => ({
    bookId: entry.book.bookId || entry.bookId,
    title: entry.book.title,
    type: entry.book.type,
    noteCount: entry.noteCount,
    reviewCount: entry.reviewCount,
    bookmarkCount: entry.bookmarkCount ?? 0,
    sort: entry.sort
  }));
  const payload = {
    ok: true,
    total: books.length,
    books
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  printText(JSON.stringify(payload, null, 2));
}
