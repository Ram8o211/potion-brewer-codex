import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, loadGame, persistGame } from '../src/core/persistence';
import { Game } from '../src/game/game';
import { createWorld } from '../src/game/world';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('durable shop saves', () => {
  it('restores actual vessel contents, inventory, knowledge and equipment', () => {
    const game = new Game(createWorld('persistence-grove'));
    game.addIngredient('water', 72); game.addIngredient('emberroot', 48);
    game.tick(1); game.test('training-dummy'); game.buyUpgrade('larger-still');
    const restored = new Game(createWorld(game.world.seed), decodeSave(encodeSave(game.exportState())));
    expect(restored.state.inventory).toEqual(game.state.inventory);
    expect(restored.state.journal).toEqual(game.state.journal);
    expect(restored.sim.metrics()).toEqual(game.sim.metrics());
    expect(restored.sim.signature()).toEqual(game.sim.signature());
  });

  it('recovers the prior valid snapshot after a corrupted current save', () => {
    const storage = new MemoryStorage(); const game = new Game(createWorld('backup'));
    persistGame(game.exportState(), storage);
    game.gather('garden', 'emberroot'); persistGame(game.exportState(), storage);
    storage.setItem('potion-brewer:save:v1', '{corrupted');
    expect(loadGame(storage)?.inventory.emberroot).toBe(96);
  });

  it('exports the shop while sandbox experiments remain isolated', () => {
    const game = new Game(createWorld('separate-sandbox')); game.addIngredient('water', 40);
    const before = game.exportState(); game.switchMode('sandbox'); game.addIngredient('void-ink', 500); game.gather('ruins', 'star-crystal');
    expect(game.exportState()).toEqual(before);
    game.switchMode('shop'); expect(game.sim.metrics().mass).toBeCloseTo(40, 6);
  });

  it.each([
    (save: Record<string, unknown>) => { save.version = 999; },
    (save: Record<string, unknown>) => { save.coins = -1; },
    (save: Record<string, unknown>) => { save.journal = [null]; },
    (save: Record<string, unknown>) => { save.bottles = [{ id: 'bad', sample: null }]; },
    (save: Record<string, unknown>) => { save.commission = { customer: '<script>', requirements: [] }; },
    (save: Record<string, unknown>) => { save.upgrades = [null]; },
    (save: Record<string, unknown>) => { save.simulation = { width: 1, height: 1, cells: [] }; },
  ])('rejects damaged or unsupported imports before replacing a running game', mutate => {
    const state = new Game(createWorld('invalid-save')).exportState() as unknown as Record<string, unknown>;
    mutate(state); expect(() => decodeSave(JSON.stringify(state))).toThrow();
  });

  it('handles a storage quota failure without losing the running state', () => {
    const game = new Game(createWorld('quota')); const storage = new MemoryStorage();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(persistGame(game.exportState(), storage)).toBe(false);
    expect(game.state.coins).toBe(75);
  });
});
