import os from 'node:os';
import path from 'node:path';

export type AppPaths = {
  rootDir: string;
  authDir: string;
  stateDir: string;
  exportsDir: string;
  cacheDir: string;
  logsDir: string;
  authFile: string;
  syncStateFile: string;
  lastResultFile: string;
};

function getRootDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'WereadSync');
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'WereadSync');
  }

  const xdgStateHome = process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state');
  return path.join(xdgStateHome, 'WereadSync');
}

export function getAppPaths(): AppPaths {
  const rootDir = getRootDir();
  const authDir = path.join(rootDir, 'auth');
  const stateDir = path.join(rootDir, 'state');
  const exportsDir = path.join(rootDir, 'exports');
  const cacheDir = path.join(rootDir, 'cache');
  const logsDir = path.join(rootDir, 'logs');

  return {
    rootDir,
    authDir,
    stateDir,
    exportsDir,
    cacheDir,
    logsDir,
    authFile: path.join(authDir, 'auth.json'),
    syncStateFile: path.join(stateDir, 'sync-state.json'),
    lastResultFile: path.join(stateDir, 'last-result.json')
  };
}
