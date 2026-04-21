import { CliError, printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchNotebookList } from '../lib/wereadClient.js';

export type NotebooksOptions = {
  vid?: string;
  skey?: string;
  json?: boolean;
};

export async function runNotebooks(options: NotebooksOptions): Promise<void> {
  const auth = await resolveAuth(options);

  const books = await fetchNotebookList(auth.vid, auth.skey);
  const payload = {
    ok: true,
    total: books.length,
    books
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  printText(`total notebooks: ${books.length}`);
}
