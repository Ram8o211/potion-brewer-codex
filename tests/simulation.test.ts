import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { EFFECTS, type Cell, type Ingredient, type World } from '../src/core/types';
import { createWorld } from '../src/game/world';

const ingredient = (id: string, values: Partial<Ingredient> = {}): Ingredient => ({
  id, name: id, subtitle: '', description: '', color: '#59bddd', icon: '●', phase: 'liquid', tier: 0, region: '', density: 1, viscosity: 0.1,
  miscibility: 'water', solubility: 0.8, conductivity: 0.6, heatCapacity: 1, melting: 0, boiling: 100, volatility: 0.4,
  cohesion: 0.2, friction: 0.6, flammability: 0, acidity: 0, stability: 1, electrical: 0, price: 1,
  effects: Object.fromEntries(EFFECTS.map(e => [e, e === 'healing' ? 0.6 : 0])) as Ingredient['effects'], ...values,
});
const world: World = { seed: 'physics', ingredients: [ingredient('water'), ingredient('oil', { density: 0.65, miscibility: 'oil', boiling: 80, volatility: 0.8 }), ingredient('sand', { phase: 'powder', density: 2.5, solubility: 0, melting: 800, boiling: 1400, friction: 0.8 }), ingredient('salt', { phase: 'powder', density: 1.6, solubility: 1, melting: 700, boiling: 1200 }), ingredient('crystal', { phase: 'solid', density: 2.1, melting: 500, boiling: 1000 }), ingredient('red'), ingredient('blue'), ingredient('product', { color: '#c2e492', effects: Object.fromEntries(EFFECTS.map(e => [e, e === 'healing' ? 1 : 0])) as Ingredient['effects'] })], reactions: [] };
const put = (sim: Simulation, x: number, y: number, id: string, temperature = 20, mass = 1.2) => {
  const definition = sim.world.ingredients.find(i => i.id === id)!;
  sim.cells[y * sim.width + x] = { composition: { [id]: mass }, mass, phase: definition.phase, temperature, agitation: 0, vx: 0, vy: 0 };
};
const run = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds * 30; i++) sim.step(1 / 30); };
const centroid = (sim: Simulation, id?: string) => {
  let total = 0, height = 0;
  sim.cells.forEach((c, i) => { const m = id ? c?.composition[id] || 0 : c?.mass || 0; total += m; height += m * Math.floor(i / sim.width); });
  return height / total;
};
const accounted = (sim: Simulation) => sim.metrics().mass + sim.escaped;

describe('conservative material simulation', () => {
  it('accepts real capacity, settles under gravity and conserves poured mass', () => {
    const sim = new Simulation(world);
    sim.capacity = 42;
    expect(sim.add('water', 100)).toBeCloseTo(42);
    const initialY = centroid(sim);
    run(sim, 3);
    expect(centroid(sim)).toBeGreaterThan(initialY + 15);
    expect(accounted(sim)).toBeCloseTo(42, 5);
    expect(sim.add('unknown', 10)).toBe(0);
  });

  it('stores and restores isolated snapshot cells', () => {
    const sim = new Simulation(world);
    sim.add('water', 20); sim.lid = true; sim.heat = 0.6; run(sim, 0.2);
    const snapshot = sim.snapshot();
    const restored = new Simulation(world, snapshot);
    expect(restored.metrics().mass).toBeCloseTo(sim.metrics().mass);
    expect(restored.signature()).toBe(sim.signature());
    const cell = restored.cells.find((c): c is Cell => !!c)!;
    cell.composition.water *= 0.5;
    expect(snapshot.cells.find(c => c)?.composition.water).not.toBe(cell.composition.water);
  });

  it('samples actual concentrations and excludes batch size from fingerprints', () => {
    const sim = new Simulation(world);
    put(sim, 31, 54, 'water', 25); put(sim, 32, 54, 'red', 25);
    const signature = sim.signature();
    const sample = sim.sample(0.6)!;
    expect(sample.mass).toBeCloseTo(0.6);
    expect(sample.composition.water).toBeCloseTo(0.3);
    expect(sim.metrics().mass + sample.mass).toBeCloseTo(2.4);
    expect(sim.signature()).toBe(signature);
    expect(sample.metrics.temperature).toBeCloseTo(25);
  });

  it('heats from the bottom and preserves local gradients', () => {
    const sim = new Simulation(world);
    for (let y = 40; y <= 54; y++) for (let x = 28; x <= 36; x++) put(sim, x, y, 'water');
    sim.heat = 1; sim.lid = true; run(sim, 3);
    const lower = sim.cells.filter((c, i) => c && Math.floor(i / 64) >= 51).map(c => c!.temperature);
    const upper = sim.cells.filter((c, i) => c && Math.floor(i / 64) < 45).map(c => c!.temperature);
    expect(lower.reduce((a, b) => a + b, 0) / lower.length).toBeGreaterThan(upper.reduce((a, b) => a + b, 0) / upper.length + 5);
    expect(accounted(sim)).toBeCloseTo(162, 4);
  });

  it('freezes connected water, melts it, and retains cold material mass', () => {
    const sim = new Simulation(world);
    put(sim, 31, 54, 'water', -10); put(sim, 32, 54, 'water', -10);
    sim.step(1 / 30);
    expect(sim.cells[54 * 64 + 31]?.phase).toBe('solid');
    sim.heat = 1; run(sim, 2);
    expect(sim.cells.some(c => c?.phase === 'liquid')).toBe(true);
    expect(accounted(sim)).toBeCloseTo(2.4, 5);
  });

  it('allows dense powder to settle through a lighter liquid', () => {
    const sim = new Simulation(world);
    for (let y = 45; y <= 54; y++) put(sim, 32, y, 'water');
    put(sim, 32, 44, 'sand');
    run(sim, 1.5);
    expect(centroid(sim, 'sand')).toBeGreaterThan(48);
    expect(accounted(sim)).toBeCloseTo(13.2, 4);
  });

  it('mixes miscible parcels faster when agitated while oils retain separation', () => {
    const make = () => { const sim = new Simulation(world); for (let y = 51; y <= 54; y++) for (let x = 27; x <= 37; x++) put(sim, x, y, x < 32 ? 'red' : 'blue'); return sim; };
    const still = make(), stirred = make();
    for (let i = 0; i < 60; i++) { stirred.stir(32, 52, i % 2 ? -3 : 3, 0); stirred.step(1 / 30); still.step(1 / 30); }
    expect(stirred.metrics().homogeneity).toBeGreaterThan(still.metrics().homogeneity + 0.03);
    expect(accounted(stirred)).toBeCloseTo(52.8, 4);
    const separated = new Simulation(world); put(separated, 31, 54, 'water'); put(separated, 32, 54, 'oil');
    separated.step(1 / 30);
    expect(separated.cells[54 * 64 + 31]?.composition.oil || 0).toBeLessThan(0.01);
  });

  it('crushes solid grains without creating or deleting ingredients', () => {
    const sim = new Simulation(world); put(sim, 32, 54, 'crystal');
    sim.crush(32, 54);
    expect(sim.cells[54 * 64 + 32]?.phase).toBe('powder');
    run(sim, 0.2);
    expect(sim.cells.some(c => c?.phase === 'powder')).toBe(true);
    expect(accounted(sim)).toBeCloseTo(1.2);
  });

  it('requires contact, temperature and agitation, then makes mass-conserving reaction products', () => {
    const reactive: World = { ...world, reactions: [{ id: 'blend', name: 'Bloom', a: 'red', b: 'blue', product: 'product', minTemp: 40, maxTemp: 80, mixing: 0.2, rate: 2, heat: 4, clue: '' }] };
    const sim = new Simulation(reactive); put(sim, 31, 54, 'red', 55); put(sim, 32, 54, 'blue', 55);
    run(sim, 0.2);
    expect(sim.cells.reduce((m, c) => m + (c?.composition.product || 0), 0)).toBe(0);
    sim.stir(32, 54, 3, 0); run(sim, 1);
    expect(sim.cells.reduce((m, c) => m + (c?.composition.product || 0), 0)).toBeGreaterThan(0.05);
    expect(accounted(sim)).toBeCloseTo(2.4, 5);
    expect(sim.events.some(event => event.includes('Bloom'))).toBe(true);
  });

  it('tracks escaped vapor and provides a measurable distillate only when hot', () => {
    const open = new Simulation(world), sealed = new Simulation(world);
    sealed.lid = true;
    put(open, 32, 12, 'oil', 120); put(sealed, 32, 12, 'oil', 120);
    run(open, 0.5); run(sealed, 0.5);
    expect(open.escaped).toBeGreaterThan(0);
    expect(sealed.metrics().mass).toBeGreaterThan(open.metrics().mass);
    expect(accounted(open)).toBeCloseTo(1.2, 5);
    expect(accounted(sealed)).toBeCloseTo(1.2, 5);
    const cold = new Simulation(world); cold.add('water', 20);
    expect(cold.distill()).toBeNull();
    const hot = new Simulation(world); put(hot, 32, 54, 'water', 105);
    const before = hot.metrics().mass;
    const fraction = hot.distill(0.5)!;
    expect(fraction.composition.water).toBeCloseTo(0.5);
    expect(hot.metrics().mass + fraction.mass).toBeCloseTo(before);
  });
});

describe('phase, transport and sustained load regressions', () => {
  it('uses the solvent freezing point instead of salt melting temperatures', () => {
    const sim = new Simulation(world);
    const cell: Cell = { composition: { water: 0.9, salt: 0.3 }, mass: 1.2, phase: 'paste', temperature: 20, agitation: 1, vx: 0, vy: 0 };
    sim.cells[54 * 64 + 32] = cell;
    sim.step(1 / 30);
    expect(sim.cells.filter(c => c?.phase === 'solid')).toHaveLength(0);
    expect(accounted(sim)).toBeCloseTo(1.2, 6);
  });

  it('moves viscous liquid more slowly while keeping local heat diffusion causal', () => {
    const viscous: World = { ...world, ingredients: [...world.ingredients, ingredient('syrup', { viscosity: 0.95 })] };
    const thin = new Simulation(viscous), thick = new Simulation(viscous);
    thin.add('water', 30); thick.add('syrup', 30);
    run(thin, 0.4); run(thick, 0.4);
    expect(centroid(thin)).toBeGreaterThan(centroid(thick) + 1);
    const diffusion = new Simulation(world);
    put(diffusion, 31, 54, 'water', 80); put(diffusion, 32, 54, 'water', 20); put(diffusion, 33, 54, 'water', 20);
    diffusion.step(1 / 30);
    expect(diffusion.cells[54 * 64 + 32]!.temperature).toBeGreaterThan(20);
    expect(diffusion.cells[54 * 64 + 33]!.temperature).toBeLessThan(diffusion.cells[54 * 64 + 32]!.temperature);
  });

  it('forms stable granular piles whose cohesive grains resist diagonal flow', () => {
    const grains: World = { ...world, ingredients: [ingredient('sticky', { phase: 'powder', density: 2, melting: 700, boiling: 1200, friction: 0.95, cohesion: 0.95 }), ingredient('loose', { phase: 'powder', density: 2, melting: 700, boiling: 1200, friction: 0.1, cohesion: 0.1 })] };
    const sticky = new Simulation(grains), loose = new Simulation(grains);
    for (let y = 48; y <= 54; y++) { put(sticky, 32, y, 'sticky'); put(loose, 32, y, 'loose'); }
    run(sticky, 0.7); run(loose, 0.7);
    expect(sticky.cells.filter((c, i) => c && i % 64 === 32).length).toBeGreaterThan(loose.cells.filter((c, i) => c && i % 64 === 32).length);
    expect(accounted(sticky)).toBeCloseTo(8.4, 6);
    const before = sticky.signature(); run(sticky, 0.3);
    expect(sticky.signature()).toBe(before);
  });

  it('condenses real enclosed hot vapor and lets droplets fall from the headspace', () => {
    const sim = new Simulation(world); sim.lid = true;
    put(sim, 32, 5, 'water', 105);
    sim.cells[5 * 64 + 32]!.phase = 'gas';
    run(sim, 2);
    expect(sim.cells.some((c, i) => c?.phase === 'liquid' && Math.floor(i / 64) >= 12)).toBe(true);
    expect(sim.lidTemperature).toBeGreaterThan(20);
    expect(sim.escaped).toBe(0);
    expect(accounted(sim)).toBeCloseTo(1.2, 6);
  });

  it('converts burning fuel into retained ash and smoke and consumes enclosed oxygen', () => {
    const combustibles: World = { ...world, ingredients: [...world.ingredients, ingredient('fuel', { boiling: 450, melting: -20, flammability: 1, volatility: 0, heatCapacity: 0.5 }), ingredient('ash', { phase: 'powder', melting: 600, boiling: 1000, flammability: 0 }), ingredient('smoke', { phase: 'gas', boiling: -30, melting: -100, density: 0.08, flammability: 0 })] };
    const sim = new Simulation(combustibles); sim.lid = true;
    put(sim, 32, 54, 'fuel', 280, 1.2);
    run(sim, 1.5);
    const ash = sim.cells.reduce((m, c) => m + (c?.composition.ash || 0), 0);
    const smoke = sim.cells.reduce((m, c) => m + (c?.composition.smoke || 0), 0);
    expect(ash).toBeGreaterThan(0.001);
    expect(smoke).toBeGreaterThan(0.001);
    expect(sim.oxygen).toBeLessThan(1);
    expect(sim.escaped).toBe(0);
    expect(accounted(sim)).toBeCloseTo(1.2, 6);
  });

  it('dries a heated solvent-powder paste into grains instead of a permanent wet phase', () => {
    const sim = new Simulation(world); sim.heat = 1;
    sim.cells[54 * 64 + 32] = { composition: { water: 0.2, salt: 1 }, mass: 1.2, phase: 'paste', temperature: 160, agitation: 0, vx: 0, vy: 0 };
    run(sim, 8);
    const solvent = sim.cells.reduce((m, c) => m + (c?.composition.water || 0), 0);
    expect(solvent).toBeLessThan(0.15);
    expect(sim.cells.some(c => c?.phase === 'powder' && (c.composition.salt || 0) / c.mass > 0.965)).toBe(true);
    expect(accounted(sim)).toBeCloseTo(1.2, 6);
  });

  it('retains deterministic subframes, stirring cadence and lid thermal history across saves', () => {
    const sim = new Simulation(world); sim.lid = true; sim.heat = 0.5; sim.heatEfficiency = 1.5;
    sim.add('water', 130); sim.add('salt', 25); sim.step(0.017); sim.step(0.22);
    sim.stir(32, 20, 3, 2);
    const restored = new Simulation(world, JSON.parse(JSON.stringify(sim.snapshot())));
    for (let i = 0; i < 20; i++) { const dt = i % 3 ? 0.019 : 0.028; sim.step(dt); restored.step(dt); }
    expect(JSON.stringify(restored.snapshot()) === JSON.stringify(sim.snapshot())).toBe(true);
  });
});


describe('complex seeded stress', () => {
  it.each(['amber-load', 'glacier-load', 'wild-load'])('conserves a full mixed vessel through 100 stirring steps and save continuation (%s)', seed => {
    const sim = new Simulation(createWorld(seed));
    sim.lid = true; sim.heat = 0.8;
    for (const [id, quantity] of [['water', 420], ['bog-venom', 190], ['frost-salt', 90], ['sun-oil', 80], ['moonleaf', 100], ['emberroot', 120]] as const) expect(sim.add(id, quantity)).toBeCloseTo(quantity, 6);
    expect(sim.add('water', 400)).toBeCloseTo(100, 6);
    const initial = accounted(sim);
    let restored: Simulation | null = null;
    for (let i = 0; i < 100; i++) {
      const x = 25 + i % 17, y = 34 + i % 19, dx = i % 2 ? 3 : -3;
      sim.stir(x, y, dx, 1.5); sim.step(1 / 30);
      if (restored) { restored.stir(x, y, dx, 1.5); restored.step(1 / 30); }
      if (i === 49) restored = new Simulation(sim.world, JSON.parse(JSON.stringify(sim.snapshot())));
    }
    expect(accounted(sim)).toBeCloseTo(initial, 6);
    expect(JSON.stringify(restored!.snapshot()) === JSON.stringify(sim.snapshot())).toBe(true);
    let invalid = 0;
    sim.cells.forEach((cell, index) => {
      if (!cell) return;
      const values = [cell.mass, cell.temperature, cell.agitation, cell.vx, cell.vy, ...Object.values(cell.composition)];
      if (!values.every(Number.isFinite) || cell.mass <= 0 || Object.values(cell.composition).some(mass => mass < 0) || Math.abs(cell.mass - Object.values(cell.composition).reduce((a, b) => a + b, 0)) > 1e-8 || !sim.isInside(index % sim.width, Math.floor(index / sim.width))) invalid++;
    });
    expect(invalid).toBe(0);
    expect(sim.cells.filter(Boolean).length).toBeLessThan(sim.width * sim.height);
    expect(sim.metrics().mass).toBeLessThanOrEqual(sim.capacity + 1e-6);
  }, 20000);
});


describe('rim and condensate regressions', () => {
  it('lets lighter oil fall through numerical solvent traces and float on the real settled pool', () => {
    const sim = new Simulation(createWorld('rim-gravity'));
    sim.add('water', 280); sim.add('sun-oil', 180);
    run(sim, 5);
    const oilAtRim = sim.cells.reduce((total, cell, index) => total + (Math.floor(index / 64) < 25 ? cell?.composition['sun-oil'] || 0 : 0), 0);
    expect(oilAtRim).toBeLessThan(1);
    expect(centroid(sim, 'sun-oil')).toBeGreaterThan(35);
    expect(centroid(sim, 'water')).toBeGreaterThan(centroid(sim, 'sun-oil'));
    expect(accounted(sim)).toBeCloseTo(460, 6);
  });

  it('condenses ingredients declared as gases below their true condensation temperature', () => {
    const condensible: World = { ...world, ingredients: [...world.ingredients, ingredient('vapor', { phase: 'gas', melting: -50, boiling: 35, flammability: 0 })] };
    const sim = new Simulation(condensible); sim.lid = true;
    put(sim, 32, 8, 'vapor', 20);
    sim.step(1 / 30);
    expect(sim.cells.some(c => c && c.composition.vapor && c.phase === 'liquid')).toBe(true);
    expect(accounted(sim)).toBeCloseTo(1.2, 6);
  });
});
