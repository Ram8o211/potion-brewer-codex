import { EFFECTS, type GameState } from './types';

const KEY = 'potion-brewer:save:v1';
const BACKUP = 'potion-brewer:save:backup';
const MAX_SIZE = 4_000_000;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max = 2000): value is string => typeof value === 'string' && value.length <= max;
const strings = (value: unknown, max = 5000): value is string[] => Array.isArray(value) && value.length <= max && value.every(v => string(v));
const composition = (value: unknown): boolean => record(value) && Object.keys(value).length <= 128 && Object.entries(value).every(([key, amount]) => string(key, 80) && !['__proto__', 'constructor', 'prototype'].includes(key) && finite(amount, 0, 1e7));
const properties = [...EFFECTS, 'temperature', 'viscosity', 'acidity', 'volatility', 'density', 'homogeneity', 'mass'];
const metrics = (value: unknown): boolean => record(value) && Object.entries(value).every(([key, amount]) => properties.includes(key) && finite(amount, -200, 1e7));
const sample = (value: unknown): boolean => record(value) && composition(value.composition) && finite(value.mass, 0, 1e7) && metrics(value.metrics) && string(value.signature, 500) && strings(value.steps);

export function decodeSave(text: string): GameState {
  if (text.length > MAX_SIZE) throw new Error('This save is too large to safely load.');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('This file is not a valid Potion Brewer save.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('The save has no game state.');
  const envelope = parsed as Record<string, unknown>;
  const raw = (envelope.format === 'potion-brewer' ? envelope.state : envelope) as GameState;
  if (!raw || raw.version !== 1) throw new Error('This save version is not supported by this edition.');
  if (typeof raw.seed !== 'string' || raw.seed.length < 1 || raw.seed.length > 80 || !finite(raw.coins, 0, 1e9) || !finite(raw.reputation, 0, 1e9) || !finite(raw.day, 1, 1e7) || !finite(raw.sales, 0, 1e7)) throw new Error('The save contains invalid shop values.');
  if (!raw.inventory || typeof raw.inventory !== 'object' || Object.keys(raw.inventory).length > 128 || !Object.values(raw.inventory).every(v => finite(v, 0, 1e7))) throw new Error('The ingredient inventory is invalid.');
  if (!strings(raw.upgrades, 50) || !strings(raw.achievements, 500) || !strings(raw.steps) || !finite(raw.tutorial, 0, 100) || !['shop', 'sandbox'].includes(raw.mode) || !record(raw.gathered) || !Object.values(raw.gathered).every(time => finite(time, 0, 1e16))) throw new Error('The save contains invalid progression records.');
  if (!Array.isArray(raw.journal) || raw.journal.length > 5000 || !raw.journal.every(row => record(row) && string(row.id) && string(row.subject) && string(row.name) && string(row.signature, 500) && string(row.observation) && metrics(row.metrics) && composition(row.composition) && strings(row.steps) && finite(row.time, 0, 1e16))) throw new Error('The experiment journal is invalid.');
  if (!Array.isArray(raw.recipes) || raw.recipes.length > 5000 || !raw.recipes.every(row => record(row) && string(row.id) && string(row.name) && string(row.signature, 500) && metrics(row.metrics) && composition(row.composition) && strings(row.steps))) throw new Error('The recipe book is invalid.');
  if (!Array.isArray(raw.bottles) || raw.bottles.length > 5000 || !raw.bottles.every(row => record(row) && string(row.id) && string(row.name) && sample(row.sample))) throw new Error('The bottled potion inventory is invalid.');
  const commission = raw.commission;
  if (!record(commission) || !finite(commission.id, 0, 1e9) || !string(commission.customer) || !string(commission.role) || !string(commission.portrait) || !string(commission.dialogue) || !string(commission.title) || !finite(commission.budget, 0, 1e9) || !Array.isArray(commission.requirements) || commission.requirements.length > 20 || !commission.requirements.every(requirement => record(requirement) && properties.includes(String(requirement.property)) && finite(requirement.weight, 0, 100) && string(requirement.label) && ['min', 'max', 'target'].every(key => requirement[key] === undefined || finite(requirement[key], -200, 1e7)))) throw new Error('The customer commission is invalid.');
  if (!record(raw.settings) || !['auto', 'low', 'high'].includes(raw.settings.quality) || !finite(raw.settings.volume, 0, 1) || typeof raw.settings.sound !== 'boolean' || typeof raw.settings.reducedMotion !== 'boolean') throw new Error('The save is missing valid settings.');
  if (raw.simulation) {
    const sim = raw.simulation;
    if (sim.width !== 64 || sim.height !== 56 || !Array.isArray(sim.cells) || sim.cells.length !== 64 * 56 || !finite(sim.heat, -1, 1) || !finite(sim.elapsed, 0, 1e12) || !finite(sim.escaped, 0, 1e7) || !finite(sim.oxygen, 0, 1) || typeof sim.lid !== 'boolean' || !strings(sim.events, 100)) throw new Error('The laboratory snapshot is invalid.');
    for (const cell of sim.cells) if (cell && (!finite(cell.mass, 0, 100) || !finite(cell.temperature, -200, 2000) || !['liquid', 'powder', 'solid', 'gas', 'paste'].includes(cell.phase) || !cell.composition || !Object.values(cell.composition).every(v => finite(v, 0, 100)) || !finite(cell.agitation, 0, 1e6) || !finite(cell.vx, -1e6, 1e6) || !finite(cell.vy, -1e6, 1e6))) throw new Error('The save contains an invalid material cell.');
  }
  return structuredClone(raw);
}

export function encodeSave(state: GameState): string {
  return JSON.stringify({ format: 'potion-brewer', exportedAt: new Date().toISOString(), state });
}

export function loadGame(storage: Storage = localStorage): GameState | undefined {
  for (const key of [KEY, BACKUP]) {
    try { const text = storage.getItem(key); if (text) return decodeSave(text); } catch { /* Recover from the prior coherent save. */ }
  }
  return undefined;
}

export function persistGame(state: GameState, storage: Storage = localStorage): boolean {
  try {
    const prior = storage.getItem(KEY);
    if (prior) { try { decodeSave(prior); storage.setItem(BACKUP, prior); } catch { /* Preserve existing good backup. */ } }
    storage.setItem(KEY, encodeSave(state));
    return true;
  } catch { return false; }
}

export function downloadSave(state: GameState): void {
  const blob = new Blob([encodeSave(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `potion-brewer-${state.seed.replace(/[^a-z0-9_-]/gi, '-').slice(0, 40)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
