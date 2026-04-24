#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';

import { runLoginStart } from './commands/loginStart.js';
import { runLoginWait } from './commands/loginWait.js';
import { runLoginInteractive } from './commands/loginInteractive.js';
import { runUserInfo } from './commands/userInfo.js';
import { runNotebooks } from './commands/notebooks.js';
import { runBookProbe } from './commands/bookProbe.js';
import { runBooksStatus } from './commands/booksStatus.js';
import { runSyncCommand } from './commands/sync.js';
import { runStatus } from './commands/status.js';
import { runLogout } from './commands/logout.js';
import { runExportDir } from './commands/exportDir.js';
import { runDemo } from './commands/demo.js';
import { handleFatalError } from './lib/output.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const program = new Command();

program.name('weread-sync').description('Independent CLI for WeRead sync').version(packageJson.version);

const login = program
  .command('login')
  .description('Login to WeRead (show QR code and wait for scan)')
  .option('--json', 'Print JSON output')
  .option('--qr-out <path>', 'Where to save the QR png')
  .action(async (options) => {
    await runLoginInteractive({
      json: options.json,
      qrOut: options.qrOut
    });
  });

login
  .command('start')
  .description('Create a login uid and local QR png')
  .option('--json', 'Print JSON output')
  .option('--qr-out <path>', 'Where to save the QR png')
  .action(async (options) => {
    await runLoginStart({
      json: options.json,
      qrOut: options.qrOut
    });
  });

login
  .command('wait')
  .description('Long-poll login result')
  .requiredOption('--uid <uid>', 'Login uid returned by login start')
  .option('--otp <code>', 'OTP code if required by the account')
  .option('--timeout-ms <ms>', 'Long-poll timeout in milliseconds')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runLoginWait({
      uid: options.uid,
      otp: options.otp,
      timeoutMs: options.timeoutMs,
      json: options.json
    });
  });

program
  .command('user-info')
  .description('Probe user-info endpoint with x-vid/x-skey')
  .option('--vid <vid>', 'webLoginVid from login result')
  .option('--skey <skey>', 'accessToken from login result')
  .option('--user-vid <userVid>', 'Optional userVid to query')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runUserInfo({
      vid: options.vid,
      skey: options.skey,
      userVid: options.userVid,
      json: options.json
    });
  });

program
  .command('notebooks')
  .description('List notebook books using current auth')
  .option('--vid <vid>', 'webLoginVid from login result')
  .option('--skey <skey>', 'accessToken from login result')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runNotebooks({
      vid: options.vid,
      skey: options.skey,
      json: options.json
    });
  });

program
  .command('book-probe')
  .description('Fetch one book detail, progress, highlights, reviews and chapters')
  .option('--vid <vid>', 'webLoginVid from login result')
  .option('--skey <skey>', 'accessToken from login result')
  .requiredOption('--book-id <bookId>', 'Target book id')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runBookProbe({
      vid: options.vid,
      skey: options.skey,
      bookId: options.bookId,
      json: options.json
    });
  });

program
  .command('books-status')
  .description('Classify books by progress and finish time')
  .option('--vid <vid>', 'webLoginVid from login result')
  .option('--skey <skey>', 'accessToken from login result')
  .option('--limit <n>', 'Max books per category in output')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runBooksStatus({
      vid: options.vid,
      skey: options.skey,
      limit: options.limit,
      json: options.json
    });
  });

program
  .command('sync')
  .description('Export notebook markdown files')
  .option('--vid <vid>', 'webLoginVid from login result')
  .option('--skey <skey>', 'accessToken from login result')
  .option('--book-id <bookId>', 'Only sync one book')
  .option(
    '--include-statuses <statuses>',
    'Comma-separated statuses: reading,finished,other. Default: reading,finished'
  )
  .option('--output-dir <path>', 'Export directory')
  .option('--force', 'Force re-export even if state fingerprint is unchanged')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runSyncCommand({
      vid: options.vid,
      skey: options.skey,
      bookId: options.bookId,
      includeStatuses: options.includeStatuses,
      outputDir: options.outputDir,
      force: options.force,
      json: options.json
    });
  });

program
  .command('demo')
  .description('Start local demo web UI')
  .option('--host <host>', 'Host to bind, default: 127.0.0.1')
  .option('--port <port>', 'Port to bind, default: 5177')
  .option('--output-dir <path>', 'Export directory')
  .option('--open', 'Open the demo URL in the default browser')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runDemo({
      host: options.host,
      port: options.port,
      outputDir: options.outputDir,
      open: options.open,
      json: options.json
    });
  });

program
  .command('status')
  .description('Show auth and last sync status')
  .option('--output-dir <path>', 'Export directory')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runStatus({
      outputDir: options.outputDir,
      json: options.json
    });
  });

program
  .command('export-dir')
  .description('Show local export directory and whether data exists')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runExportDir({
      json: options.json
    });
  });

program
  .command('logout')
  .description('Clear saved auth')
  .option('--json', 'Print JSON output')
  .action(async (options) => {
    await runLogout({
      json: options.json
    });
  });

program.parseAsync(process.argv).catch((error) => {
  handleFatalError(error);
});
