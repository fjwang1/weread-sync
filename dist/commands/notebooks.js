import { printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchNotebookList } from '../lib/wereadClient.js';
export async function runNotebooks(options) {
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
