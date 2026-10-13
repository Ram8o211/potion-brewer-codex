import { defineConfig } from 'vite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export default defineConfig({
  base: './', build: { target: 'es2022', sourcemap: true },
  plugins: [{ name: 'offline-precache', closeBundle() {
    const dist = resolve('dist');
    const list = (directory: string, prefix = ''): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(resolve(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
    const files = list(dist).filter(file => file !== 'sw.js' && !file.endsWith('.map'));
    const hash = createHash('sha256').update(files.map(file => readFileSync(resolve(dist, file))).join('')).digest('hex').slice(0, 12);
    const source = readFileSync('public/sw.js', 'utf8').replace('__BUILD_ID__', hash).replace('__PRECACHE__', JSON.stringify(['./', ...files.map(file => `./${file}`)]));
    writeFileSync(resolve(dist, 'sw.js'), source);
  }}],
  test: { include: ['tests/**/*.test.ts'] }
} as Parameters<typeof defineConfig>[0]);
