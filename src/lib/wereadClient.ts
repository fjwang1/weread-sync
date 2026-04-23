import { CliError } from './output.js';

const BASE_URL = 'https://weread.qq.com';

type RequestInitWithTimeout = RequestInit & {
  timeoutMs?: number;
};

export type LoginUidResponse = {
  uid: string;
};

export type LoginInfoResponse = {
  succeed?: boolean;
  logicCode?: string;
  accessToken?: string;
  webLoginVid?: number;
  [key: string]: unknown;
};

export type NotebookEntry = {
  bookId: string;
  book: {
    bookId: string;
    title: string;
    type: number;
  };
  noteCount: number;
  reviewCount: number;
  bookmarkCount?: number;
  sort: number;
};

type WereadErrorShape = {
  errCode?: number;
  errMsg?: string;
  errLog?: string;
  errcode?: number;
  errmsg?: string;
  errlog?: string;
};

export async function requestWereadJson<T>(
  path: string,
  init: RequestInitWithTimeout = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs;
  const timer =
    typeof timeoutMs === 'number'
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      ...init,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...init.headers
      },
      signal: controller.signal
    });

    const text = await response.text();
    let json: unknown = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new CliError(`Expected JSON from ${path}`, 'INVALID_JSON', {
          bodyPreview: text.slice(0, 200)
        });
      }
    }

    if (!response.ok) {
      throw new CliError(
        `HTTP ${response.status} ${response.statusText} for ${path}`,
        'HTTP_ERROR',
        json
      );
    }

    if (json && typeof json === 'object') {
      const wereadError = json as WereadErrorShape;
      const errCode = wereadError.errCode ?? wereadError.errcode;
      if (typeof errCode === 'number' && errCode < 0) {
        const message =
          wereadError.errMsg ?? wereadError.errmsg ?? `WeRead returned error ${errCode}`;

        // WeRead uses -2010 / -2012 for invalid/expired credentials
        const isAuthError = errCode === -2010 || errCode === -2012;
        throw new CliError(
          isAuthError ? `${message}. Auth expired, please run 'login start' to re-authenticate.` : message,
          isAuthError ? 'AUTH_EXPIRED' : 'WEREAD_ERROR',
          json
        );
      }
    }

    return json as T;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new CliError(`Request timed out for ${path}`, 'REQUEST_TIMEOUT', {
        timeoutMs
      });
    }

    throw new CliError(
      error instanceof Error ? error.message : String(error),
      'NETWORK_ERROR'
    );
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function getConfirmUrl(uid: string): string {
  return `${BASE_URL}/web/confirm?uid=${encodeURIComponent(uid)}`;
}

export async function getLoginUid(): Promise<LoginUidResponse> {
  return requestWereadJson<LoginUidResponse>('/api/auth/getLoginUid');
}

export async function waitForLogin(
  uid: string,
  otp?: string,
  timeoutMs = 65_000
): Promise<LoginInfoResponse> {
  const searchParams = new URLSearchParams({ uid });
  if (otp) {
    searchParams.set('otp', otp);
  }

  return requestWereadJson<LoginInfoResponse>(
    `/api/auth/getLoginInfo?${searchParams.toString()}`,
    {
      timeoutMs
    }
  );
}

export async function fetchUserInfo(vid: string, skey: string, userVid?: string): Promise<unknown> {
  const effectiveUserVid = userVid ?? vid;

  return requestWereadJson(`/api/userInfo?userVid=${encodeURIComponent(effectiveUserVid)}`, {
    headers: {
      'x-vid': vid,
      'x-skey': skey
    }
  });
}

function createCookieHeader(vid: string, skey: string): string {
  return `wr_vid=${vid}; wr_skey=${skey}`;
}

export async function fetchNotebookList(vid: string, skey: string): Promise<NotebookEntry[]> {
  const response = await requestWereadJson<{ books?: NotebookEntry[] }>('/api/user/notebook', {
    headers: {
      'x-vid': vid,
      'x-skey': skey
    }
  });

  return response.books ?? [];
}

export async function fetchBookmarkList(vid: string, skey: string, bookId: string): Promise<unknown> {
  return requestWereadJson(`/web/book/bookmarklist?bookId=${encodeURIComponent(bookId)}`, {
    headers: {
      Cookie: createCookieHeader(vid, skey)
    }
  });
}

export async function fetchReviewList(vid: string, skey: string, bookId: string): Promise<unknown> {
  return requestWereadJson(
    `/web/review/list?bookId=${encodeURIComponent(bookId)}&listType=11&mine=1&synckey=0`,
    {
      headers: {
        Cookie: createCookieHeader(vid, skey)
      }
    }
  );
}

export async function fetchBookInfo(vid: string, skey: string, bookId: string): Promise<unknown> {
  return requestWereadJson(`/web/book/info?bookId=${encodeURIComponent(bookId)}`, {
    headers: {
      Cookie: createCookieHeader(vid, skey)
    }
  });
}

export async function fetchBookProgress(vid: string, skey: string, bookId: string): Promise<unknown> {
  return requestWereadJson(`/web/book/getProgress?bookId=${encodeURIComponent(bookId)}`, {
    headers: {
      Cookie: createCookieHeader(vid, skey)
    }
  });
}

export async function fetchChapterInfos(vid: string, skey: string, bookId: string): Promise<unknown> {
  return requestWereadJson('/web/book/chapterInfos', {
    method: 'POST',
    headers: {
      Cookie: createCookieHeader(vid, skey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      bookIds: [bookId]
    })
  });
}
