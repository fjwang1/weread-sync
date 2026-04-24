import fs from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import QRCode from 'qrcode';

import { loadStoredAuth, saveStoredAuth } from './authStore.js';
import { cacheBookCover, type CachedCover } from './coverCache.js';
import { buildDemoCatalog, type DemoBook, type DemoCatalog } from './demoCatalog.js';
import { renderMarkdownToHtml } from './demoMarkdown.js';
import { CliError } from './output.js';
import { runSync } from './syncEngine.js';
import { loadSyncState, saveSyncState } from './syncStateStore.js';
import type { ReadingStatus } from './statusFilter.js';
import {
  fetchBookInfo,
  fetchNotebookList,
  fetchUserInfo,
  getConfirmUrl,
  getLoginUid,
  waitForLogin,
  type LoginInfoResponse
} from './wereadClient.js';

export type DemoServerOptions = {
  host?: string;
  port?: number;
  outputDir?: string;
};

export type DemoServerHandle = {
  host: string;
  port: number;
  url: string;
  server: http.Server;
  close: () => Promise<void>;
};

type DemoJob = {
  id: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

const DEFAULT_PORT = 5177;
const DEFAULT_HOST = '127.0.0.1';
const SYNC_STATUSES: ReadingStatus[] = ['reading', 'finished'];

const jobs = new Map<string, DemoJob>();
let authIssue: { code: string; message: string; checkedAt: string } | null = null;

function staticRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../demo/static');
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') {
    return 'text/html; charset=utf-8';
  }
  if (extension === '.css') {
    return 'text/css; charset=utf-8';
  }
  if (extension === '.js') {
    return 'text/javascript; charset=utf-8';
  }
  if (extension === '.svg') {
    return 'image/svg+xml; charset=utf-8';
  }
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  if (extension === '.gif') {
    return 'image/gif';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, statusCode: number, contentType: string, payload: string | Buffer): void {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  response.end(payload);
}

function sendError(response: ServerResponse, statusCode: number, code: string, message: string): void {
  sendJson(response, statusCode, {
    ok: false,
    error: {
      code,
      message
    }
  });
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof CliError) {
    return {
      code: error.code ?? 'CLI_ERROR',
      message: error.message
    };
  }

  return {
    code: 'UNEXPECTED_ERROR',
    message: error instanceof Error ? error.message : String(error)
  };
}

function rememberAuthIssue(error: unknown): void {
  const normalized = normalizeError(error);
  if (normalized.code !== 'AUTH_EXPIRED' && normalized.code !== 'NOT_LOGGED_IN') {
    return;
  }

  authIssue = {
    ...normalized,
    checkedAt: new Date().toISOString()
  };
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) {
      throw new CliError('Request body too large', 'BODY_TOO_LARGE');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function createJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeJob(job: DemoJob): DemoJob {
  return job;
}

function findRunningJob(): DemoJob | undefined {
  return [...jobs.values()].find((job) => job.status === 'running');
}

function startSyncJob(outputDir: string | undefined, force: boolean): DemoJob {
  const runningJob = findRunningJob();
  if (runningJob) {
    return runningJob;
  }

  const job: DemoJob = {
    id: createJobId(),
    status: 'running',
    startedAt: new Date().toISOString()
  };
  jobs.set(job.id, job);

  void (async () => {
    try {
      const result = await runSync({
        includeStatuses: SYNC_STATUSES,
        outputDir,
        force
      });
      await buildDemoCatalog({ outputDir: result.outputDir });
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
      job.result = result;
    } catch (error) {
      rememberAuthIssue(error);
      job.status = 'error';
      job.finishedAt = new Date().toISOString();
      job.error = normalizeError(error);
    }
  })();

  return job;
}

async function catalogState(outputDir?: string): Promise<{
  authenticated: boolean;
  authValid: boolean | null;
  authIssue: string | null;
  loginAt: string | null;
  hasCache: boolean;
  syncing: boolean;
  outputDir: string;
  bookCount: number;
  missingCoverCount: number;
  lastSyncAt: string | null;
}> {
  const [auth, catalog] = await Promise.all([
    loadStoredAuth(),
    buildDemoCatalog({ outputDir })
  ]);

  return {
    authenticated: Boolean(auth),
    authValid: auth ? authIssue === null : false,
    authIssue: authIssue?.message ?? null,
    loginAt: auth?.loginAt ?? null,
    hasCache: catalog.books.length > 0,
    syncing: Boolean(findRunningJob()),
    outputDir: catalog.outputDir,
    bookCount: catalog.books.length,
    missingCoverCount: catalog.books.filter((book) => !book.coverPath).length,
    lastSyncAt: catalog.books[0]?.syncedAt || null
  };
}

async function checkAuth(): Promise<{
  authenticated: boolean;
  valid: boolean;
  reason: string | null;
}> {
  const auth = await loadStoredAuth();
  if (!auth) {
    authIssue = null;
    return {
      authenticated: false,
      valid: false,
      reason: 'NOT_LOGGED_IN'
    };
  }

  try {
    await fetchNotebookList(auth.webLoginVid, auth.accessToken);
    authIssue = null;
    return {
      authenticated: true,
      valid: true,
      reason: null
    };
  } catch (error) {
    rememberAuthIssue(error);
    const normalized = normalizeError(error);
    return {
      authenticated: true,
      valid: false,
      reason: normalized.message
    };
  }
}

async function saveLogin(result: LoginInfoResponse): Promise<{ vid: string; loginAt: string }> {
  const webLoginVid = String(result.webLoginVid);
  const accessToken = String(result.accessToken);
  let userInfo: unknown;

  try {
    userInfo = await fetchUserInfo(webLoginVid, accessToken);
  } catch {
    userInfo = undefined;
  }

  const loginAt = new Date().toISOString();
  await saveStoredAuth({
    webLoginVid,
    accessToken,
    refreshToken: result.refreshToken ? String(result.refreshToken) : undefined,
    loginAt,
    userInfo
  });
  authIssue = null;

  return {
    vid: webLoginVid,
    loginAt
  };
}

function isLoggedIn(result: LoginInfoResponse): boolean {
  return Boolean(result.succeed && result.webLoginVid && result.accessToken);
}

async function handleLoginStart(response: ServerResponse): Promise<void> {
  const result = await getLoginUid();
  if (!result.uid) {
    throw new CliError('Missing uid from login response', 'UID_MISSING');
  }

  const confirmUrl = getConfirmUrl(result.uid);
  const qrDataUrl = await QRCode.toDataURL(confirmUrl, {
    width: 320,
    margin: 2
  });

  sendJson(response, 200, {
    ok: true,
    uid: result.uid,
    confirmUrl,
    qrDataUrl
  });
}

async function handleLoginPoll(requestUrl: URL, response: ServerResponse): Promise<void> {
  const uid = requestUrl.searchParams.get('uid');
  if (!uid) {
    sendError(response, 400, 'UID_REQUIRED', 'Missing uid');
    return;
  }

  try {
    const result = await waitForLogin(uid, undefined, 25_000);
    if (isLoggedIn(result)) {
      const login = await saveLogin(result);
      sendJson(response, 200, {
        ok: true,
        status: 'logged-in',
        ...login
      });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      status: 'waiting',
      reason: result.logicCode ?? 'waiting'
    });
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === 'REQUEST_TIMEOUT' || normalized.code === 'NETWORK_ERROR') {
      sendJson(response, 200, {
        ok: true,
        status: 'waiting',
        reason: normalized.code
      });
      return;
    }

    throw error;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function placeholderCover(book: DemoBook): string {
  const mark = escapeXml(Array.from(book.title || '书').slice(0, 2).join(''));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <rect width="480" height="640" rx="22" fill="#f7f7f4"/>
  <rect x="36" y="36" width="408" height="568" rx="16" fill="#fff" stroke="#e6e6e6"/>
  <text x="240" y="292" text-anchor="middle" font-family="TsangerJinKai02, STKaiti, KaiTi, serif" font-size="54" fill="#a67c52">${mark}</text>
  <text x="240" y="342" text-anchor="middle" font-family="TsangerJinKai02, STKaiti, KaiTi, serif" font-size="20" fill="#8a8a8a">微信读书评论</text>
</svg>`;
}

async function rememberCover(bookId: string, cover: CachedCover): Promise<void> {
  const syncState = await loadSyncState();
  const stateBook = syncState?.books[bookId];
  if (!syncState || !stateBook) {
    return;
  }

  syncState.books[bookId] = {
    ...stateBook,
    coverUrl: cover.coverUrl,
    coverPath: cover.coverPath,
    coverCheckedAt: new Date().toISOString()
  };
  await saveSyncState(syncState);
}

async function loadCoverOnDemand(book: DemoBook): Promise<string | null> {
  if (book.coverUrl) {
    const cover = await cacheBookCover(book.bookId, { cover: book.coverUrl });
    await rememberCover(book.bookId, cover);
    return cover.coverPath;
  }

  const auth = await loadStoredAuth();
  if (!auth) {
    return null;
  }

  try {
    const bookInfo = await fetchBookInfo(auth.webLoginVid, auth.accessToken, book.bookId);
    const cover = await cacheBookCover(book.bookId, bookInfo);
    await rememberCover(book.bookId, cover);
    return cover.coverPath;
  } catch (error) {
    rememberAuthIssue(error);
    return null;
  }
}

async function serveCover(bookId: string, response: ServerResponse, outputDir?: string): Promise<void> {
  const catalog = await buildDemoCatalog({ outputDir });
  const book = catalog.books.find((item) => item.bookId === bookId);
  if (!book) {
    sendError(response, 404, 'BOOK_NOT_FOUND', 'Book not found');
    return;
  }

  if (book.coverPath) {
    try {
      const data = await fs.readFile(book.coverPath);
      sendText(response, 200, contentTypeFor(book.coverPath), data);
      return;
    } catch {
      // Fall through to local placeholder.
    }
  }

  const coverPath = await loadCoverOnDemand(book);
  if (coverPath) {
    try {
      const data = await fs.readFile(coverPath);
      sendText(response, 200, contentTypeFor(coverPath), data);
      return;
    } catch {
      // Fall through to local placeholder.
    }
  }

  sendText(response, 200, 'image/svg+xml; charset=utf-8', placeholderCover(book));
}

async function serveBookDetail(bookId: string, response: ServerResponse, outputDir?: string): Promise<void> {
  const catalog = await buildDemoCatalog({ outputDir });
  const book = catalog.books.find((item) => item.bookId === bookId);
  if (!book) {
    sendError(response, 404, 'BOOK_NOT_FOUND', 'Book not found');
    return;
  }

  const markdown = await fs.readFile(book.exportFile, 'utf8');
  sendJson(response, 200, {
    ok: true,
    book,
    html: renderMarkdownToHtml(markdown)
  });
}

async function serveStatic(requestUrl: URL, response: ServerResponse): Promise<void> {
  const root = staticRoot();
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath =
    pathname === '/' || pathname.startsWith('/books/')
      ? 'index.html'
      : pathname.startsWith('/assets/')
        ? pathname.slice('/assets/'.length)
        : pathname.slice(1);
  const filePath = path.resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendError(response, 403, 'FORBIDDEN', 'Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    sendText(response, 200, contentTypeFor(filePath), data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      sendError(response, 404, 'NOT_FOUND', 'Not found');
      return;
    }
    throw error;
  }
}

function createRequestHandler(options: DemoServerOptions) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    try {
      if (requestUrl.pathname === '/api/state' && request.method === 'GET') {
        sendJson(response, 200, {
          ok: true,
          state: await catalogState(options.outputDir)
        });
        return;
      }

      if (requestUrl.pathname === '/api/auth/check' && request.method === 'GET') {
        sendJson(response, 200, {
          ok: true,
          auth: await checkAuth()
        });
        return;
      }

      if (requestUrl.pathname === '/api/books' && request.method === 'GET') {
        const catalog = await buildDemoCatalog({ outputDir: options.outputDir });
        sendJson(response, 200, {
          ok: true,
          catalog
        });
        return;
      }

      const bookRoute = /^\/api\/books\/([^/]+)(\/cover)?$/.exec(requestUrl.pathname);
      if (bookRoute && (request.method === 'GET' || request.method === 'HEAD')) {
        const bookId = decodeURIComponent(bookRoute[1]);
        if (bookRoute[2]) {
          await serveCover(bookId, response, options.outputDir);
        } else {
          await serveBookDetail(bookId, response, options.outputDir);
        }
        return;
      }

      if (requestUrl.pathname === '/api/login/start' && request.method === 'POST') {
        await handleLoginStart(response);
        return;
      }

      if (requestUrl.pathname === '/api/login/poll' && request.method === 'GET') {
        await handleLoginPoll(requestUrl, response);
        return;
      }

      if (requestUrl.pathname === '/api/sync' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const job = startSyncJob(options.outputDir, body.force === true);
        sendJson(response, 202, {
          ok: true,
          job: serializeJob(job)
        });
        return;
      }

      const jobRoute = /^\/api\/jobs\/([^/]+)$/.exec(requestUrl.pathname);
      if (jobRoute && request.method === 'GET') {
        const job = jobs.get(decodeURIComponent(jobRoute[1]));
        if (!job) {
          sendError(response, 404, 'JOB_NOT_FOUND', 'Job not found');
          return;
        }
        sendJson(response, 200, {
          ok: true,
          job: serializeJob(job)
        });
        return;
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        await serveStatic(requestUrl, response);
        return;
      }

      sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    } catch (error) {
      const normalized = normalizeError(error);
      sendError(response, normalized.code === 'BODY_TOO_LARGE' ? 413 : 500, normalized.code, normalized.message);
    }
  };
}

async function listen(host: string, port: number, handler: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export async function startDemoServer(options: DemoServerOptions = {}): Promise<DemoServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const startPort = options.port ?? DEFAULT_PORT;
  const handler = createRequestHandler(options);

  for (let offset = 0; offset < 20; offset += 1) {
    const port = startPort + offset;
    try {
      const server = await listen(host, port, handler);
      const close = () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });

      return {
        host,
        port,
        url: `http://${host}:${port}`,
        server,
        close
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new CliError(`No available port from ${startPort} to ${startPort + 19}`, 'PORT_UNAVAILABLE');
}
