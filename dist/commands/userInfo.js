import { printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchUserInfo } from '../lib/wereadClient.js';
export async function runUserInfo(options) {
    const auth = await resolveAuth(options);
    const result = await fetchUserInfo(auth.vid, auth.skey, options.userVid);
    const payload = {
        ok: true,
        result
    };
    if (options.json) {
        printJson(payload);
        return;
    }
    printText(JSON.stringify(payload, null, 2));
}
