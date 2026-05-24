import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(repoRoot, 'site');
const distDir = path.join(repoRoot, 'dist');

await rm(distDir, { recursive: true, force: true });
await cp(siteDir, distDir, { recursive: true });

console.log(`Static site copied to ${path.relative(repoRoot, distDir)}`);
