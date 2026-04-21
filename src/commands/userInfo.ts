import { CliError, printJson, printText } from '../lib/output.js';
import { resolveAuth } from '../lib/authResolver.js';
import { fetchUserInfo } from '../lib/wereadClient.js';

export type UserInfoOptions = {
  vid?: string;
  skey?: string;
  userVid?: string;
  json?: boolean;
};

export async function runUserInfo(options: UserInfoOptions): Promise<void> {
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
