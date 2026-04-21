import { printJson, printText } from '../lib/output.js';
import { runSync } from '../lib/syncEngine.js';
import { parseIncludeStatuses } from '../lib/statusFilter.js';

export type SyncCommandOptions = {
  vid?: string;
  skey?: string;
  includeStatuses?: string;
  outputDir?: string;
  force?: boolean;
  bookId?: string;
  json?: boolean;
};

export async function runSyncCommand(options: SyncCommandOptions): Promise<void> {
  const result = await runSync({
    vid: options.vid,
    skey: options.skey,
    includeStatuses: parseIncludeStatuses(options.includeStatuses),
    outputDir: options.outputDir,
    force: options.force,
    bookId: options.bookId
  });

  if (options.json) {
    printJson(result);
    return;
  }

  printText(`同步完成`);
  printText(`纳入范围：${result.includeStatuses.join(', ')}`);
  printText(`本次更新：${result.syncedBooks}`);
  printText(`本次跳过：${result.skippedBooks}`);
  printText(`导出目录：${result.outputDir}`);
}
