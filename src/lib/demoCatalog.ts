import fs from 'node:fs/promises';
import path from 'node:path';

import { getAppPaths } from './appPaths.js';
import { markdownHasDisplayContent } from './demoMarkdown.js';
import { ensureDir, writeJsonFile } from './fileStore.js';
import { loadSyncState } from './syncStateStore.js';

export type DemoBook = {
  bookId: string;
  title: string;
  author: string;
  status: string;
  progress: number | null;
  finishTime: number | null;
  noteCount: number | null;
  reviewCount: number | null;
  syncedAt: string;
  exportFile: string;
  coverUrl: string | null;
  coverPath: string | null;
};

export type DemoCatalog = {
  generatedAt: string;
  outputDir: string;
  books: DemoBook[];
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseYamlString(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  if (trimmed === 'null') {
    return '';
  }

  return trimmed;
}

function parseYamlNumber(value: string | undefined): number | null {
  const text = parseYamlString(value);
  if (!text) {
    return null;
  }

  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseFrontmatter(markdown: string): Record<string, string> {
  if (!markdown.startsWith('---')) {
    return {};
  }

  const endIndex = markdown.indexOf('\n---', 3);
  if (endIndex === -1) {
    return {};
  }

  const result: Record<string, string> = {};
  const body = markdown.slice(3, endIndex);
  for (const line of body.split(/\r?\n/)) {
    const match = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

async function readMarkdownFile(filePath: string): Promise<{
  content: string;
  meta: Record<string, string>;
}> {
  const content = await fs.readFile(filePath, 'utf8');
  return {
    content,
    meta: parseFrontmatter(content)
  };
}

function bookIdFromFile(filePath: string): string {
  const baseName = path.basename(filePath, '.md');
  const match = /__(.+)$/.exec(baseName);
  return match?.[1] ?? baseName;
}

function titleFromFile(filePath: string): string {
  const baseName = path.basename(filePath, '.md');
  return baseName.replace(/__(.+)$/, '');
}

async function scanMarkdownFiles(outputDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(outputDir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function createBookFromFile(filePath: string): Promise<DemoBook | null> {
  const { content, meta } = await readMarkdownFile(filePath);
  if (!markdownHasDisplayContent(content)) {
    return null;
  }

  return {
    bookId: parseYamlString(meta.bookId) || bookIdFromFile(filePath),
    title: parseYamlString(meta.title) || titleFromFile(filePath),
    author: parseYamlString(meta.author),
    status: parseYamlString(meta.status),
    progress: parseYamlNumber(meta.progress),
    finishTime: null,
    noteCount: parseYamlNumber(meta.noteCount),
    reviewCount: parseYamlNumber(meta.reviewCount),
    syncedAt: parseYamlString(meta.lastSyncAt),
    exportFile: filePath,
    coverUrl: parseYamlString(meta.coverUrl) || null,
    coverPath: null
  };
}

async function saveCatalog(catalog: DemoCatalog): Promise<void> {
  const catalogFile = path.join(getAppPaths().cacheDir, 'demo', 'catalog.json');
  await ensureDir(path.dirname(catalogFile));
  await writeJsonFile(catalogFile, catalog);
}

export async function buildDemoCatalog(options: { outputDir?: string } = {}): Promise<DemoCatalog> {
  const syncState = await loadSyncState();
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : syncState?.outputDir
      ? path.resolve(syncState.outputDir)
      : getAppPaths().exportsDir;
  const booksById = new Map<string, DemoBook>();

  if (syncState?.books) {
    for (const [bookId, stateBook] of Object.entries(syncState.books)) {
      const exportFile = path.resolve(stateBook.exportFile);
      if (!(await pathExists(exportFile))) {
        continue;
      }

      const { content, meta } = await readMarkdownFile(exportFile);
      if (!markdownHasDisplayContent(content)) {
        continue;
      }

      const coverPath =
        stateBook.coverPath && (await pathExists(stateBook.coverPath)) ? stateBook.coverPath : null;

      booksById.set(bookId, {
        bookId,
        title: parseYamlString(meta.title) || stateBook.title,
        author: stateBook.author ?? parseYamlString(meta.author),
        status: stateBook.status || parseYamlString(meta.status),
        progress: stateBook.progress ?? parseYamlNumber(meta.progress),
        finishTime: stateBook.finishTime,
        noteCount: stateBook.noteCount ?? parseYamlNumber(meta.noteCount),
        reviewCount: stateBook.reviewCount ?? parseYamlNumber(meta.reviewCount),
        syncedAt: stateBook.syncedAt || parseYamlString(meta.lastSyncAt),
        exportFile,
        coverUrl: stateBook.coverUrl ?? (parseYamlString(meta.coverUrl) || null),
        coverPath
      });
    }
  }

  for (const filePath of await scanMarkdownFiles(outputDir)) {
    const book = await createBookFromFile(path.resolve(filePath));
    if (book && !booksById.has(book.bookId)) {
      booksById.set(book.bookId, book);
    }
  }

  const books = [...booksById.values()].sort((left, right) => {
    const bySyncedAt = right.syncedAt.localeCompare(left.syncedAt);
    return bySyncedAt || left.title.localeCompare(right.title, 'zh-Hans-CN');
  });

  const catalog = {
    generatedAt: new Date().toISOString(),
    outputDir,
    books
  };

  await saveCatalog(catalog);
  return catalog;
}
