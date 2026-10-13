import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export default defineConfig({
  base: './', build: { target: 'es2022', sourcemap: true },
  plugins: [{ name: 'offline-precache', closeBundle() {
    const dist = resolve('dist');
    mkdirSync(resolve(dist, 'licenses'), { recursive: true });
    copyFileSync('LICENSE', resolve(dist, 'LICENSE.txt'));
    for (const font of ['DM-Sans', 'Fraunces']) copyFileSync(`docs/licenses/${font}.txt`, resolve(dist, `licenses/${font}.txt`));
    const list = (directory: string, prefix = ''): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(resolve(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
    const files = list(dist).filter(file => file !== 'sw.js' && !file.endsWith('.map'));
    const worker = readFileSync('public/sw.js', 'utf8');
    const hash = createHash('sha256').update(files.map(file => readFileSync(resolve(dist, file))).join('')).update(worker).digest('hex').slice(0, 12);
    const source = worker.replace('__BUILD_ID__', hash).replace('__PRECACHE__', JSON.stringify(['./', ...files.map(file => `./${file}`)]));
    writeFileSync(resolve(dist, 'sw.js'), source);
  }}],
  test: { include: ['tests/**/*.test.ts'] }
} as Parameters<typeof defineConfig>[0]);
