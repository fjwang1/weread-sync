import fs from 'node:fs/promises';
import { printJson, printText } from '../lib/output.js';
import { getStatus } from '../lib/syncEngine.js';
async function countMarkdownFiles(dirPath) {
    try {
        const entries = await fs.readdir(dirPath);
        return entries.filter((entry) => entry.endsWith('.md')).length;
    }
    catch {
        return 0;
    }
}
async function dirExists(dirPath) {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
export async function runExportDir(options) {
    const { outputDir } = await getStatus({});
    const exists = await dirExists(outputDir);
    const fileCount = exists ? await countMarkdownFiles(outputDir) : 0;
    const hasData = exists && fileCount > 0;
    const payload = {
        ok: true,
        hasData,
        exportDir: hasData ? outputDir : null,
        fileCount
    };
    if (options.json) {
        printJson(payload);
        return;
    }
    if (hasData) {
        printText(outputDir);
    }
    else {
        printText('本地还没有同步数据，请先执行 sync 拉取。');
    }
}
