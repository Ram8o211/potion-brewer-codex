import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2022', sourcemap: true }, test: { include: ['tests/**/*.test.ts'] } } as Parameters<typeof defineConfig>[0]);
