import { CliError } from './output.js';
const BASE_URL = 'https://weread.qq.com';
export async function requestWereadJson(path, init = {}) {
    const controller = new AbortController();
    const timeoutMs = init.timeoutMs;
    const timer = typeof timeoutMs === 'number'
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
        let json = null;
        if (text) {
            try {
                json = JSON.parse(text);
            }
            catch {
                throw new CliError(`Expected JSON from ${path}`, 'INVALID_JSON', {
                    bodyPreview: text.slice(0, 200)
                });
            }
        }
        if (!response.ok) {
            if (response.status === 401) {
                throw new CliError(`登录已失效，请重新登录`, 'AUTH_EXPIRED', json);
            }
            throw new CliError(`HTTP ${response.status} ${response.statusText} for ${path}`, 'HTTP_ERROR', json);
        }
        if (json && typeof json === 'object') {
            const wereadError = json;
            const errCode = wereadError.errCode ?? wereadError.errcode;
            if (typeof errCode === 'number' && errCode < 0) {
                const message = wereadError.errMsg ?? wereadError.errmsg ?? `WeRead returned error ${errCode}`;
                // WeRead uses -2010 / -2012 for invalid/expired credentials
                const isAuthError = errCode === -2010 || errCode === -2012;
                throw new CliError(isAuthError ? `${message}. Auth expired, please run 'login start' to re-authenticate.` : message, isAuthError ? 'AUTH_EXPIRED' : 'WEREAD_ERROR', json);
            }
        }
        return json;
    }
    catch (error) {
        if (error instanceof CliError) {
            throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new CliError(`Request timed out for ${path}`, 'REQUEST_TIMEOUT', {
                timeoutMs
            });
        }
        throw new CliError(error instanceof Error ? error.message : String(error), 'NETWORK_ERROR');
    }
    finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
export function getConfirmUrl(uid) {
    return `${BASE_URL}/web/confirm?uid=${encodeURIComponent(uid)}`;
}
export async function getLoginUid() {
    return requestWereadJson('/api/auth/getLoginUid');
}
export async function waitForLogin(uid, otp, timeoutMs = 65_000) {
    const searchParams = new URLSearchParams({ uid });
    if (otp) {
        searchParams.set('otp', otp);
    }
    return requestWereadJson(`/api/auth/getLoginInfo?${searchParams.toString()}`, {
        timeoutMs
    });
}
export async function fetchUserInfo(vid, skey, userVid) {
    const effectiveUserVid = userVid ?? vid;
    return requestWereadJson(`/api/userInfo?userVid=${encodeURIComponent(effectiveUserVid)}`, {
        headers: {
            'x-vid': vid,
            'x-skey': skey
        }
    });
}
function createCookieHeader(vid, skey) {
    return `wr_vid=${vid}; wr_skey=${skey}`;
}
export async function fetchNotebookList(vid, skey) {
    const response = await requestWereadJson('/api/user/notebook', {
        headers: {
            'x-vid': vid,
            'x-skey': skey
        }
    });
    return response.books ?? [];
}
export async function fetchBookmarkList(vid, skey, bookId) {
    return requestWereadJson(`/web/book/bookmarklist?bookId=${encodeURIComponent(bookId)}`, {
        headers: {
            Cookie: createCookieHeader(vid, skey)
        }
    });
}
export async function fetchReviewList(vid, skey, bookId) {
    return requestWereadJson(`/web/review/list?bookId=${encodeURIComponent(bookId)}&listType=11&mine=1&synckey=0`, {
        headers: {
            Cookie: createCookieHeader(vid, skey)
        }
    });
}
export async function fetchBookInfo(vid, skey, bookId) {
    return requestWereadJson(`/web/book/info?bookId=${encodeURIComponent(bookId)}`, {
        headers: {
            Cookie: createCookieHeader(vid, skey)
        }
    });
}
export async function fetchBookProgress(vid, skey, bookId) {
    return requestWereadJson(`/web/book/getProgress?bookId=${encodeURIComponent(bookId)}`, {
        headers: {
            Cookie: createCookieHeader(vid, skey)
        }
    });
}
export async function fetchChapterInfos(vid, skey, bookId) {
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
