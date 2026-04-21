import { CliError } from './output.js';
import { loadStoredAuth } from './authStore.js';
export async function resolveAuth(options) {
    if (options.vid && options.skey) {
        return {
            vid: options.vid,
            skey: options.skey
        };
    }
    const storedAuth = await loadStoredAuth();
    if (!storedAuth) {
        throw new CliError('No saved auth found. Please login first.', 'NOT_LOGGED_IN');
    }
    return {
        vid: storedAuth.webLoginVid,
        skey: storedAuth.accessToken
    };
}
