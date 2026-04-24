import { spawn } from 'node:child_process';
import { startDemoServer } from '../lib/demoServer.js';
import { CliError, printJson, printText } from '../lib/output.js';
function parsePort(value) {
    if (!value) {
        return undefined;
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new CliError(`Invalid port: ${value}`, 'INVALID_PORT');
    }
    return port;
}
function openUrl(url) {
    const command = process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open';
    const args = process.platform === 'darwin'
        ? [url]
        : process.platform === 'win32'
            ? ['/c', 'start', '', url]
            : [url];
    const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
}
export async function runDemo(options) {
    const handle = await startDemoServer({
        host: options.host,
        port: parsePort(options.port),
        outputDir: options.outputDir
    });
    if (options.json) {
        printJson({
            ok: true,
            url: handle.url,
            host: handle.host,
            port: handle.port
        });
    }
    else {
        printText(`demo 已启动：${handle.url}`);
        printText('按 Ctrl+C 退出。');
    }
    if (options.open) {
        openUrl(handle.url);
    }
    await new Promise((resolve) => {
        const stop = async () => {
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
            await handle.close();
            resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    });
}
