import './render/fonts.css';
import './ui/styles.css';
import { Game } from './game/game';
import { createWorld } from './game/world';
import { decodeSave, downloadSave, loadGame, persistGame } from './core/persistence';
import { AlchemyAudio } from './render/audio';
import { mountApp } from './ui/app';
import type { GameState } from './core/types';

const root = document.querySelector<HTMLElement>('#app')!;
const audio = new AlchemyAudio();
const saved = loadGame();
let game = new Game(createWorld(saved?.seed || 'moonlit-1347'), saved);
if (!saved) game.state.settings.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let app: ReturnType<typeof mountApp>;
let lastSave = performance.now();
let lastFrame = performance.now();
let lastRender = lastFrame;
let frameSamples: number[] = [];
let performanceInfo = { fps: 60, frameMs: 0, simulationMs: 0, frames: 0 };
let slowFrames = 0;
let adaptiveLow = false;

function save(): void {
  audio.configure(game.state.settings.sound, game.state.settings.volume);
  if (!persistGame(game.exportState())) game.lastMessage = 'Browser storage is full or unavailable. Export your save from Settings to keep your progress.';
  lastSave = performance.now();
}
function attach(): void {
  audio.configure(game.state.settings.sound, game.state.settings.volume);
  app = mountApp(root, game, {
    save,
    newWorld(seed) {
      const normalized = seed.trim().slice(0, 80) || 'moonlit-1347';
      app.destroy(); game = new Game(createWorld(normalized)); attach(); save();
    },
    exportSave() { save(); downloadSave(game.exportState()); },
    async importSave(file) {
      try {
        if (file.size > 4_000_000) throw new Error('This save is too large to safely load.');
        const state: GameState = decodeSave(await file.text());
        const replacement = new Game(createWorld(state.seed), state);
        app.destroy(); game = replacement; attach(); save(); game.lastMessage = 'Your apothecary has been restored.';
      } catch (error) { game.lastMessage = error instanceof Error ? error.message : 'This save could not be imported.'; }
    },
    sound(event) { audio.configure(game.state.settings.sound, game.state.settings.volume); audio.play(event); },
    setVolume(value) { audio.configure(game.state.settings.sound, value); },
  });
}
attach();
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); lastFrame = performance.now(); });
window.addEventListener('pagehide', save);

function frame(now: number): void {
  const frameDuration = Math.max(0, now - lastFrame);
  const elapsed = Math.min(0.05, frameDuration / 1000);
  lastFrame = now;
  if (!document.hidden) {
    const start = performance.now(); game.tick(elapsed); performanceInfo.simulationMs = performance.now() - start;
    frameSamples.push(frameDuration); if (frameSamples.length > 60) frameSamples.shift();
    const average = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
    performanceInfo = { ...performanceInfo, fps: Math.round(1000 / Math.max(average, 1)), frameMs: average, frames: performanceInfo.frames + 1 };
    slowFrames = average > 25 ? Math.min(120, slowFrames + 1) : Math.max(0, slowFrames - 1);
    adaptiveLow = slowFrames > 60;
    const quality = game.state.settings.quality;
    document.documentElement.dataset.renderQuality = quality === 'auto' ? (adaptiveLow ? 'low' : 'high') : quality;
    if (now - lastRender >= (quality === 'low' || (quality === 'auto' && adaptiveLow) ? 32 : 14)) { app.update(Math.min(0.1, (now - lastRender) / 1000)); lastRender = now; }
    if (now - lastSave > 5000) save();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).get('debug') === '1') {
  Object.defineProperty(window, '__POTION_DEV__', { value: { get game() { return game; }, get performance() { return performanceInfo; }, save, snapshot: () => game.exportState() } });
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('./sw.js', document.baseURI).href, { scope: './' }).catch(() => { game.lastMessage = 'Offline installation is unavailable in this browser. Your local save still works.'; });
  });
}
