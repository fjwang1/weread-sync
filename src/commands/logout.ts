import { clearStoredAuth } from '../lib/authStore.js';
import { printJson, printText } from '../lib/output.js';

export type LogoutOptions = {
  json?: boolean;
};

export async function runLogout(options: LogoutOptions): Promise<void> {
  await clearStoredAuth();

  if (options.json) {
    printJson({
      ok: true
    });
    return;
  }

  printText('已退出登录');
}
