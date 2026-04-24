import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src', 'demo');
const target = path.join(root, 'dist', 'demo');

await fs.rm(target, { recursive: true, force: true });
await fs.cp(source, target, { recursive: true });
