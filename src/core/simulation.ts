import { EFFECTS, type Cell, type Ingredient, type Phase, type PotionMetrics, type Sample, type SimulationSnapshot, type World } from './types';

const AMBIENT = 20;
const CELL_CAPACITY = 1.2;
const EPSILON = 1e-10;
const FIXED_DT = 1 / 30;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sum = (composition: Record<string, number>) => Object.values(composition).reduce((a, b) => a + b, 0);
const copyCell = (c: Cell): Cell => ({ ...c, composition: { ...c.composition } });

type Properties = Pick<Ingredient, 'density' | 'viscosity' | 'conductivity' | 'heatCapacity' | 'melting' | 'boiling' | 'volatility' | 'cohesion' | 'friction' | 'solubility' | 'flammability'>;
const PROPERTY_KEYS: (keyof Properties)[] = ['density', 'viscosity', 'conductivity', 'heatCapacity', 'melting', 'boiling', 'volatility', 'cohesion', 'friction', 'solubility', 'flammability'];

/** A conservative cellular material model. Temperatures are degrees Celsius; mass is game units. */
export class Simulation {
  readonly width = 64;
  readonly height = 56;
  cells: (Cell | null)[] = Array.from({ length: this.width * this.height }, () => null);
  heat = 0;
  lid = false;
  elapsed = 0;
  escaped = 0;
  oxygen = 1;
  events: string[] = [];
  capacity = 1100;
  heatEfficiency = 1;
  coolingEfficiency = 1;
  lidTemperature = AMBIENT;
  get heatingEfficiency() { return this.heatEfficiency; }
  set heatingEfficiency(value: number) { this.heatEfficiency = Math.max(0, value); }
  private remainder = 0;
  private ticks = 0;
  private readonly ingredients: Map<string, Ingredient>;
  private readonly reactionEvents = new Set<string>();
  private propertiesCache = new WeakMap<Cell, Properties>();
  private dominantCache = new WeakMap<Cell, Ingredient>();
  private cachedMetrics: PotionMetrics | null = null;
  private cachedSignature: string | null = null;
  private cachedStamp: string | null = null;
  private readonly ingredientCodes: Map<string, number>;
  private readonly minimumReactionMixing: number;

  constructor(public readonly world: World, snapshot?: SimulationSnapshot | null) {
    this.ingredients = new Map(world.ingredients.map(i => [i.id, i]));
    this.ingredientCodes = new Map(world.ingredients.map((ingredient, index) => [ingredient.id, index + 1]));
    this.minimumReactionMixing = Math.min(...world.reactions.map(r => r.mixing));
    if (snapshot?.width === this.width && snapshot.height === this.height) {
      this.heat = clamp(snapshot.heat || 0, -1, 1);
      this.lid = !!snapshot.lid;
      this.elapsed = Math.max(0, snapshot.elapsed || 0);
      this.escaped = Math.max(0, snapshot.escaped || 0);
      this.oxygen = clamp(snapshot.oxygen ?? 1, 0, 1);
      this.events = snapshot.events.slice(-30);
      for (const reaction of this.world.reactions) if (this.events.some(event => event.startsWith(`${reaction.name}:`))) this.reactionEvents.add(reaction.id);
      this.ticks = Math.max(0, Math.floor(snapshot.ticks ?? 0));
      this.remainder = clamp(snapshot.remainder ?? 0, 0, FIXED_DT);
      this.lidTemperature = clamp(snapshot.lidTemperature ?? AMBIENT, -80, 800);
      this.heatEfficiency = Math.max(0, snapshot.heatEfficiency ?? 1);
      this.coolingEfficiency = Math.max(0, snapshot.coolingEfficiency ?? 1);
      this.cells = this.cells.map((_, index) => {
        const incoming = snapshot.cells[index];
        if (!incoming) return null;
        const composition = Object.fromEntries(Object.entries(incoming.composition).filter(([id, mass]) => this.ingredients.has(id) && Number.isFinite(mass) && mass > 0));
        const actualMass = sum(composition);
        const mass = Number.isFinite(incoming.mass) && Math.abs(incoming.mass - actualMass) < 1e-8 ? incoming.mass : actualMass;
        if (!mass) return null;
        return { ...incoming, composition, mass, temperature: clamp(incoming.temperature, -80, 800), agitation: clamp(incoming.agitation || 0, 0, 1), vx: incoming.vx || 0, vy: incoming.vy || 0 };
      });
    }
  }

  /** Bowl outline. Closing the lid adds a real enclosed headspace above the rim. */
  isInside(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 2 || y > 54) return false;
    if (y < 12) return this.lid && x >= 7 && x <= 57;
    const inset = 6 + 16 * ((y - 12) / 42) ** 2;
    return x >= Math.ceil(inset) && x <= Math.floor(64 - inset);
  }

  private index(x: number, y: number) { return y * this.width + x; }
  private at(x: number, y: number) { return this.cells[this.index(x, y)] ?? null; }
  private log(message: string) {
    if (this.events[this.events.length - 1] !== message) this.events.push(message);
    if (this.events.length > 30) this.events.shift();
  }
  private props(cell: Cell): Properties {
    const cached = this.propertiesCache.get(cell);
    if (cached) return cached;
    const result: Properties = { density: 0, viscosity: 0, conductivity: 0, heatCapacity: 0, melting: 0, boiling: 0, volatility: 0, cohesion: 0, friction: 0, solubility: 0, flammability: 0 };
    let biggest = -1;
    for (const [id, mass] of Object.entries(cell.composition)) {
      const ingredient = this.ingredients.get(id);
      if (!ingredient) continue;
      if (mass > biggest) { biggest = mass; this.dominantCache.set(cell, ingredient); }
      const fraction = mass / Math.max(cell.mass, EPSILON);
      for (const key of PROPERTY_KEYS) result[key] += ingredient[key] * fraction;
    }
    result.heatCapacity = Math.max(0.15, result.heatCapacity);
    this.propertiesCache.set(cell, result);
    return result;
  }
  private dominant(cell: Cell): Ingredient {
    const cached = this.dominantCache.get(cell);
    if (cached) return cached;
    let biggest = -1;
    let ingredient = this.world.ingredients[0];
    for (const [id, mass] of Object.entries(cell.composition)) if (mass > biggest && this.ingredients.has(id)) { biggest = mass; ingredient = this.ingredients.get(id)!; }
    this.dominantCache.set(cell, ingredient);
    return ingredient;
  }
  private invalidate(cell: Cell) { this.propertiesCache.delete(cell); this.dominantCache.delete(cell); }
  private clean(index: number) {
    const cell = this.cells[index];
    if (!cell) return;
    for (const id of Object.keys(cell.composition)) if (cell.composition[id] <= 0) delete cell.composition[id];
    cell.mass = sum(cell.composition);
    if (cell.mass <= 0) this.cells[index] = null;
  }
  private invalidateAggregates() { this.cachedMetrics = null; this.cachedSignature = null; this.cachedStamp = null; }
  private ensureAggregates() {
    // Cells are intentionally public to the renderer and inspectable tools. A small
    // checksum detects direct mutations without rerunning all effect/variance sums.
    let mass = 0, temperature = 0, material = 0, spatial = 0, phase = 0, agitation = 0;
    const phaseCodes: Record<Phase, number> = { liquid: 1, powder: 2, solid: 3, gas: 4, paste: 5 };
    for (let index = 0; index < this.cells.length; index++) {
      const cell = this.cells[index];
      if (!cell) continue;
      mass += cell.mass; temperature += cell.mass * cell.temperature;
      phase += cell.mass * phaseCodes[cell.phase]; agitation += cell.mass * cell.agitation;
      for (const id in cell.composition) {
        const weight = (this.ingredientCodes.get(id) || 0) * cell.composition[id];
        material += weight; spatial += weight * (index + 1);
      }
    }
    const stamp = `${mass}|${temperature}|${material}|${spatial}|${phase}|${agitation}`;
    if (stamp !== this.cachedStamp) { this.cachedMetrics = null; this.cachedSignature = null; this.cachedStamp = stamp; }
  }
  private totalMass() { return this.cells.reduce((mass, cell) => mass + (cell?.mass || 0), 0); }

  /** Pour from the rim. The returned quantity is the actual accepted inventory amount. */
  add(id: string, amount: number, x = 32): number {
    const ingredient = this.ingredients.get(id);
    if (!ingredient || !Number.isFinite(amount) || amount <= 0) return 0;
    let remaining = Math.min(amount, Math.max(0, this.capacity - this.totalMass()));
    const accepted = remaining;
    const columns = Array.from({ length: 53 }, (_, i) => i + 6).sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
    // Fill a short stream, then fan across the rim; gravity moves every new parcel afterward.
    for (let y = 12; y <= 54 && remaining > EPSILON; y++) for (const col of columns) {
      if (!this.isInside(col, y)) continue;
      const index = this.index(col, y);
      const cell = this.cells[index];
      if (cell && cell.phase !== ingredient.phase && cell.mass >= CELL_CAPACITY - EPSILON) continue;
      const fill = Math.min(remaining, CELL_CAPACITY - (cell?.mass || 0));
      if (fill <= EPSILON) continue;
      if (cell) {
        cell.composition[id] = (cell.composition[id] || 0) + fill;
        cell.temperature = (cell.temperature * cell.mass + AMBIENT * fill) / (cell.mass + fill);
        cell.mass += fill;
        this.invalidate(cell);
        this.updatePhase(cell);
      } else this.cells[index] = { composition: { [id]: fill }, mass: fill, phase: ingredient.phase, temperature: AMBIENT, agitation: 0, vx: 0, vy: ingredient.phase === 'gas' ? -2 : 2 };
      remaining -= fill;
      if (remaining <= EPSILON) break;
    }
    const actual = accepted - remaining;
    if (actual > EPSILON) this.invalidateAggregates();
    if (actual > EPSILON) this.log(`Added ${actual.toFixed(1)} ${ingredient.name}`);
    return actual;
  }

  /** Stable fixed substeps; frames up to two seconds are bounded to sixty iterations. */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.remainder += Math.min(dt, 2);
    let iterations = 0;
    while (this.remainder + EPSILON >= FIXED_DT && iterations++ < 60) {
      this.tick(FIXED_DT);
      this.remainder = Math.max(0, this.remainder - FIXED_DT);
    }
  }

  private tick(dt: number) {
    this.invalidateAggregates();
    this.propertiesCache = new WeakMap();
    this.dominantCache = new WeakMap();
    this.elapsed += dt;
    this.ticks++;
    this.heat = clamp(this.heat, -1, 1);
    this.oxygen = clamp(this.oxygen + (this.lid ? 0.0008 : 0.12) * dt, 0, 1);
    this.thermal(dt);
    this.transport(dt);
    this.mixAndReact(dt);
    for (let index = 0; index < this.cells.length; index++) {
      const cell = this.cells[index];
      if (!cell) continue;
      cell.agitation *= Math.exp(-dt * 0.28);
      cell.vx *= Math.exp(-dt * 1.4);
      cell.vy *= Math.exp(-dt * 1.4);
      this.updatePhase(cell);
      this.clean(index);
    }
  }

  private thermal(dt: number) {
    if (this.lid) {
      let vaporTemperature = 0, vaporMass = 0;
      for (let i = 0; i < 12 * this.width; i++) {
        const cell = this.cells[i];
        if (cell) { vaporTemperature += cell.temperature * cell.mass; vaporMass += cell.mass; }
      }
      if (vaporMass) this.lidTemperature += (vaporTemperature / vaporMass - this.lidTemperature) * Math.min(0.1, dt * vaporMass * 0.012);
    }
    this.lidTemperature += (AMBIENT - this.lidTemperature) * dt * 0.02;
    // Exchange equal energy, accounting for each parcel's actual thermal capacity.
    for (let y = 2; y <= 54; y++) for (let x = 6; x <= 58; x++) {
      const cell = this.at(x, y);
      if (!cell) continue;
      const p = this.props(cell);
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        const neighbor = this.at(nx, ny);
        if (!neighbor) continue;
        const np = this.props(neighbor);
        const c1 = Math.max(EPSILON, cell.mass * p.heatCapacity);
        const c2 = Math.max(EPSILON, neighbor.mass * np.heatCapacity);
        const conductivity = clamp((p.conductivity + np.conductivity) * 0.5, 0.03, 2);
        const energy = (neighbor.temperature - cell.temperature) * (c1 * c2 / (c1 + c2)) * Math.min(0.35, dt * conductivity * 4);
        cell.temperature += energy / c1;
        neighbor.temperature -= energy / c2;
      }
      const belowWall = !this.isInside(x, y + 1) && y >= 35;
      const wallDistance = 54 - y;
      const heater = belowWall ? 1 : y > 46 ? Math.exp(-wallDistance * 0.22) * 0.4 : 0;
      cell.temperature += this.heat * heater * dt * (this.heat < 0 ? 35 * this.coolingEfficiency : 28 * this.heatEfficiency) / p.heatCapacity;
      // Gas loses heat quickly against the cold upper wall; exposed liquids lose it more slowly.
      const exposed = !this.at(x, y - 1);
      const loss = cell.phase === 'gas' ? (y < 12 ? 0.32 : 0.12) : exposed ? 0.025 : 0.003;
      cell.temperature += ((this.lid && y < 14 ? this.lidTemperature : AMBIENT) - cell.temperature) * dt * loss;
      cell.temperature = clamp(cell.temperature, -80, 800);
      if (p.flammability > 0.12 && cell.temperature > Math.max(95, Math.min(260, p.boiling * 0.9)) && this.oxygen > 0.04) {
        const eligible = Object.entries(cell.composition).filter(([id]) => this.ingredients.get(id)!.flammability > 0.12);
        const fuelMass = eligible.reduce((total, [, mass]) => total + mass, 0);
        const burned = Math.min(fuelMass * 0.15, fuelMass * p.flammability * dt * 0.035 * this.oxygen);
        for (const [id, mass] of eligible) cell.composition[id] -= burned * mass / Math.max(fuelMass, EPSILON);
        cell.mass -= burned;
        if (this.ingredients.has('ash') && this.ingredients.has('smoke')) {
          const ash = burned * 0.35, smoke = burned - ash;
          cell.composition.ash = (cell.composition.ash || 0) + ash;
          cell.mass += ash;
          const smokeTarget = [[x, y - 1], [x - 1, y - 1], [x + 1, y - 1]].find(([nx, ny]) => this.isInside(nx, ny) && (!this.at(nx, ny) || this.at(nx, ny)!.phase === 'gas') && (this.at(nx, ny)?.mass || 0) + smoke <= CELL_CAPACITY);
          if (smokeTarget) {
            const targetIndex = this.index(smokeTarget[0], smokeTarget[1]);
            const target = this.cells[targetIndex];
            if (target) { target.composition.smoke = (target.composition.smoke || 0) + smoke; target.mass += smoke; }
            else this.cells[targetIndex] = { composition: { smoke }, mass: smoke, phase: 'gas', temperature: cell.temperature, agitation: 0, vx: 0, vy: -2 };
          } else if (!this.lid && y <= 12) this.escaped += smoke;
          else { cell.composition.smoke = (cell.composition.smoke || 0) + smoke; cell.mass += smoke; }
        } else this.escaped += burned;
        this.invalidate(cell);
        this.oxygen = Math.max(0, this.oxygen - burned * 0.05);
        cell.temperature += burned * 180 / Math.max(0.05, cell.mass * p.heatCapacity);
        if (this.ticks % 60 === 0) this.log('Combustion produced ash and smoke; oxygen consumed');
      }
      this.updatePhase(cell);
      if (cell.phase !== 'gas') this.evaporate(x, y, cell, dt);
    }
  }

  private evaporate(x: number, y: number, cell: Cell, dt: number) {
    if (cell.phase === 'solid' && !Object.keys(cell.composition).some(id => this.ingredients.get(id)!.phase === 'liquid')) return;
    const above = this.at(x, y - 1);
    if (above && above.phase !== 'gas') return;
    const canRetain = this.isInside(x, y - 1);
    if (!canRetain && this.lid) return; // an airtight wall is not a vapor outlet
    for (const [id, mass] of Object.entries(cell.composition)) {
      const ingredient = this.ingredients.get(id)!;
      if (ingredient.volatility <= 0 && cell.temperature < ingredient.boiling) continue;
      const superheat = cell.temperature - ingredient.boiling;
      const rate = superheat >= 0 ? 0.3 + Math.min(1, superheat / 30) : ingredient.volatility * 0.0015 * Math.exp(Math.max(-8, superheat / 24));
      const evaporated = Math.min(mass, mass * rate * dt, above ? Math.max(0, CELL_CAPACITY - above.mass) : CELL_CAPACITY);
      if (evaporated < EPSILON) continue;
      if (canRetain) {
        const index = this.index(x, y - 1);
        const target = this.cells[index];
        if (target) {
          target.temperature = (target.temperature * target.mass + cell.temperature * evaporated) / (target.mass + evaporated);
          target.composition[id] = (target.composition[id] || 0) + evaporated;
          target.mass += evaporated;
          this.invalidate(target);
        } else this.cells[index] = { composition: { [id]: evaporated }, mass: evaporated, phase: 'gas', temperature: cell.temperature, agitation: cell.agitation, vx: 0, vy: -2 };
      } else this.escaped += evaporated;
      cell.composition[id] -= evaporated;
      cell.mass -= evaporated;
      this.invalidate(cell);
      cell.temperature -= evaporated * 8 / Math.max(0.1, cell.mass * this.props(cell).heatCapacity);
    }
  }

  private updatePhase(cell: Cell) {
    if (cell.mass < EPSILON) return;
    const p = this.props(cell);
    const dominant = this.dominant(cell);
    const previous = cell.phase;
    if (cell.phase === 'gas') {
      if (cell.temperature < p.boiling - 7) cell.phase = dominant.phase === 'powder' || dominant.phase === 'solid' ? dominant.phase : 'liquid';
      return;
    }
    if (cell.temperature > p.boiling + 2) { cell.phase = 'gas'; if (previous !== 'gas' && this.ticks % 30 === 0) this.log('Vapor formed at its boiling point'); return; }
    let liquidMass = 0, powderMass = 0, solidMass = 0, dissolving = 0;
    for (const [id, mass] of Object.entries(cell.composition)) {
      const ingredient = this.ingredients.get(id)!;
      if (ingredient.phase === 'liquid' || ingredient.phase === 'paste' || cell.temperature >= ingredient.melting) liquidMass += mass;
      else if (ingredient.phase === 'powder' || (ingredient.phase === 'solid' && cell.phase !== 'solid')) { powderMass += mass; dissolving += mass * ingredient.solubility; }
      else solidMass += mass;
    }
    // Powder melting points are not solvent freezing points. Dissolved solutes modestly
    // depress the solvent threshold rather than freezing a warm salt-water mixture.
    let solventMass = 0, solventMelting = 0;
    for (const [id, mass] of Object.entries(cell.composition)) {
      const ingredient = this.ingredients.get(id)!;
      if (ingredient.phase === 'liquid' || ingredient.phase === 'paste') { solventMass += mass; solventMelting += ingredient.melting * mass; }
    }
    const freezingPoint = solventMass ? solventMelting / solventMass - powderMass / solventMass * 4 : -Infinity;
    if (solventMass > cell.mass * 0.65 && cell.temperature <= freezingPoint - 0.5) {
      cell.phase = previous === 'powder' ? 'powder' : 'solid';
      if (previous !== 'solid' && previous !== 'powder' && this.ticks % 30 === 0) this.log('The mixture froze into a solid crust');
      return;
    }
    if (solidMass > cell.mass * 0.5) cell.phase = previous === 'powder' ? 'powder' : 'solid';
    else if (powderMass > 0 && liquidMass < Math.max(EPSILON, cell.mass * 0.035)) cell.phase = 'powder';
    else if ((powderMass + solidMass) / cell.mass > 0.13) {
      const soluble = dissolving / Math.max(powderMass, EPSILON);
      const canDissolve = powderMass <= liquidMass * soluble && (cell.agitation > 0.12 || previous === 'liquid');
      cell.phase = canDissolve ? 'liquid' : 'paste';
    } else cell.phase = 'liquid';
  }

  /** Transfer an actual proportional parcel; no renderer-only color blending. */
  private transfer(from: number, to: number, quantity: number): number {
    if (from === to) return 0;
    const source = this.cells[from];
    if (!source || quantity <= EPSILON) return 0;
    const target = this.cells[to];
    if (target && source.phase !== 'gas' && target.phase !== 'gas' && target.mass > 0.08 && !this.compatible(source, target) && Math.max(source.agitation, target.agitation) < 0.55) return 0;
    const amount = Math.min(quantity, source.mass, Math.max(0, CELL_CAPACITY - (target?.mass || 0)));
    if (amount < EPSILON) return 0;
    const fraction = amount / source.mass;
    const parcel: Record<string, number> = {};
    for (const [id, mass] of Object.entries(source.composition)) { parcel[id] = mass * fraction; source.composition[id] -= parcel[id]; }
    if (target) {
      target.temperature = (target.temperature * target.mass + source.temperature * amount) / (target.mass + amount);
      target.agitation = (target.agitation * target.mass + source.agitation * amount) / (target.mass + amount);
      for (const [id, mass] of Object.entries(parcel)) target.composition[id] = (target.composition[id] || 0) + mass;
      target.mass += amount;
      this.invalidate(target);
    } else this.cells[to] = { ...source, mass: amount, composition: parcel };
    source.mass -= amount;
    this.clean(from);
    return amount;
  }

  private transport(dt: number) {
    const moved = new Uint8Array(this.cells.length);
    // Gas travels upward before the downward liquid/grain pass.
    for (let y = 2; y <= 54; y++) for (let k = 6; k <= 58; k++) {
      const x = this.ticks % 2 ? k : 64 - k;
      const index = this.index(x, y);
      const cell = this.cells[index];
      if (!cell || cell.phase !== 'gas' || moved[index]) continue;
      const up = y - 1;
      if (!this.isInside(x, up)) {
        if (!this.lid && y <= 12) { this.escaped += cell.mass; this.cells[index] = null; }
        else for (const side of [-1, 1]) if (this.isInside(x + side, y)) this.transfer(index, this.index(x + side, y), cell.mass * 0.25);
        continue;
      }
      const aboveIndex = this.index(x, up);
      const above = this.cells[aboveIndex];
      if (!above || above.phase === 'gas') { this.transfer(index, aboveIndex, cell.mass); moved[aboveIndex] = 1; }
      else if (above.phase !== 'solid' && above.phase !== 'powder') {
        this.cells[aboveIndex] = cell; this.cells[index] = above; moved[aboveIndex] = 1;
      }
    }
    for (let y = 54; y >= 2; y--) for (let k = 6; k <= 58; k++) {
      const x = this.ticks % 2 ? k : 64 - k;
      const index = this.index(x, y);
      let cell = this.cells[index];
      if (!cell || cell.phase === 'gas' || moved[index]) continue;
      const p = this.props(cell);
      const frozen = this.dominant(cell).phase === 'liquid' && cell.phase === 'solid';
      if (frozen && [[x - 1, y], [x + 1, y], [x, y + 1]].some(([nx, ny]) => this.at(nx, ny)?.phase === 'solid')) continue;
      const down = this.index(x, y + 1);
      const below = this.cells[down];
      const liquid = cell.phase === 'liquid' || cell.phase === 'paste';
      const mobility = liquid ? clamp(1 / (1 + p.viscosity * 3), 0.05, 1) : 1;
      if (this.isInside(x, y + 1)) {
        // Buoyancy must also exchange partly filled immiscible parcels. Otherwise
        // a failed mixing transfer can pin a dense liquid above a lighter one.
        if (below && below.phase === 'liquid' && below.mass > 0.08 && cell.mass > 0.08 && this.props(below).density < p.density * 0.98 && this.ticks % 3 === 0) {
          this.cells[down] = cell; this.cells[index] = below; moved[down] = 1;
          continue;
        }
        if (!below || (below.phase === cell.phase && below.mass < CELL_CAPACITY - EPSILON) || (liquid && (below.phase === 'liquid' || below.phase === 'paste') && below.mass < CELL_CAPACITY - EPSILON)) {
          this.transfer(index, down, cell.mass * mobility);
          moved[down] = 1;
        } else if (below.phase !== 'solid' && below.phase !== 'powder' && below.phase !== 'paste' && this.props(below).density < p.density * 0.98 && this.ticks % 3 === 0) {
          this.cells[down] = cell; this.cells[index] = below; moved[down] = 1;
          continue;
        }
      }
      cell = this.cells[index];
      if (!cell) continue;
      // Grains use diagonal slope relaxation; friction/cohesion preserve piles.
      const sides = this.ticks % 2 ? [-1, 1] : [1, -1];
      for (const side of sides) {
        if (!this.cells[index]) break;
        const diagonal = this.index(x + side, y + 1);
        if (this.isInside(x + side, y + 1) && !this.cells[diagonal] && (liquid || p.friction + p.cohesion < 1.5 || cell.agitation > 0.2)) {
          this.transfer(index, diagonal, liquid ? cell.mass * mobility * 0.55 : cell.mass);
          moved[diagonal] = 1;
        }
      }
      cell = this.cells[index];
      if (!cell) continue;
      // Liquids level their free surface; paste resists flow according to viscosity.
      if (liquid) for (const side of sides) {
        if (!this.isInside(x + side, y)) continue;
        const targetIndex = this.index(x + side, y);
        const neighbor = this.cells[targetIndex];
        if (neighbor && neighbor.phase !== 'liquid' && neighbor.phase !== 'paste') continue;
        const difference = cell.mass - (neighbor?.mass || 0);
        if (difference > 0.03) this.transfer(index, targetIndex, difference * 0.38 * mobility);
      }
      cell = this.cells[index];
      if (cell && (Math.abs(cell.vx) > 0.1 || Math.abs(cell.vy) > 0.1)) {
        const nx = x + Math.sign(cell.vx), ny = y + Math.sign(cell.vy);
        if (this.isInside(nx, ny)) {
          const target = this.index(nx, ny);
          const neighbor = this.cells[target];
          const strength = Math.min(0.8, Math.hypot(cell.vx, cell.vy) * dt);
          if (!neighbor || (neighbor.phase !== 'solid' && neighbor.phase !== 'powder')) {
            this.transfer(index, target, cell.mass * strength);
            if (neighbor && neighbor.mass > CELL_CAPACITY * 0.9 && strength > 0.2 && this.ticks % 2 === 0) { this.cells[target] = cell; this.cells[index] = neighbor; moved[target] = 1; }
          }
        }
      }
    }
  }

  private compatible(a: Cell, b: Cell) {
    const da = this.dominant(a), db = this.dominant(b);
    return da.miscibility === db.miscibility || da.miscibility === 'universal' || db.miscibility === 'universal' || da.phase === 'powder' || db.phase === 'powder';
  }

  private exchange(a: Cell, b: Cell, amount: number) {
    amount = Math.min(amount, a.mass * 0.45, b.mass * 0.45);
    if (amount <= EPSILON) return;
    const inverseA = 1 / a.mass, inverseB = 1 / b.mass;
    let changed = false;
    // Each species has an independent flux. Read both values before modifying either.
    for (const id in a.composition) {
      const beforeA = a.composition[id], beforeB = b.composition[id] || 0;
      const delta = amount * (beforeB * inverseB - beforeA * inverseA);
      if (Math.abs(delta) < 1e-12) continue;
      a.composition[id] = beforeA + delta;
      b.composition[id] = beforeB - delta;
      changed = true;
    }
    for (const id in b.composition) {
      if (id in a.composition) continue;
      const delta = amount * b.composition[id] * inverseB;
      if (delta < 1e-12) continue;
      a.composition[id] = delta;
      b.composition[id] -= delta;
      changed = true;
    }
    if (changed) { this.invalidate(a); this.invalidate(b); }
  }

  private mixAndReact(dt: number) {
    for (let y = 2; y <= 54; y++) for (let x = 6; x <= 58; x++) {
      const cell = this.at(x, y);
      if (!cell) continue;
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        const neighbor = this.at(nx, ny);
        if (!neighbor) continue;
        const wet = [cell.phase, neighbor.phase].some(p => p === 'liquid' || p === 'paste');
        if (wet && cell.phase !== 'solid' && neighbor.phase !== 'solid' && cell.phase !== 'gas' && neighbor.phase !== 'gas') {
          const p1 = this.props(cell), p2 = this.props(neighbor);
          const agitation = (cell.agitation + neighbor.agitation) / 2;
          const grain = cell.phase === 'powder' || neighbor.phase === 'powder';
          const solubility = grain ? Math.max(p1.solubility, p2.solubility) : 1;
          const miscibility = this.compatible(cell, neighbor) ? 1 : agitation > 0.55 ? 0.08 : 0;
          const rate = miscibility * solubility * (0.02 + agitation * 3) / (1 + p1.viscosity + p2.viscosity);
          this.exchange(cell, neighbor, Math.min(cell.mass, neighbor.mass) * rate * dt);
        }
        this.reactPair(cell, neighbor, dt);
      }
      this.reactPair(cell, cell, dt);
    }
  }

  private reactPair(a: Cell, b: Cell, dt: number) {
    if ((a.agitation + b.agitation) / 2 < this.minimumReactionMixing) return;
    for (const reaction of this.world.reactions) {
      if (!this.ingredients.has(reaction.product)) continue;
      const temperature = (a.temperature + b.temperature) / 2;
      if (temperature < reaction.minTemp || temperature > reaction.maxTemp || (a.agitation + b.agitation) / 2 < reaction.mixing) continue;
      const amountA = a.composition[reaction.a] || 0, amountB = b.composition[reaction.b] || 0;
      const reverse = a !== b && (!amountA || !amountB);
      const sourceA = reverse ? b : a, sourceB = reverse ? a : b;
      const availableA = sourceA.composition[reaction.a] || 0, availableB = sourceB.composition[reaction.b] || 0;
      let amount = Math.min(availableA, availableB) * Math.min(0.25, Math.max(0, reaction.rate) * dt);
      if (sourceA === sourceB && reaction.a === reaction.b) amount *= 0.5;
      if (amount < EPSILON) continue;
      sourceA.composition[reaction.a] -= amount;
      sourceB.composition[reaction.b] -= amount;
      sourceA.composition[reaction.product] = (sourceA.composition[reaction.product] || 0) + amount;
      sourceB.composition[reaction.product] = (sourceB.composition[reaction.product] || 0) + amount;
      this.invalidate(sourceA); this.invalidate(sourceB);
      for (const cell of new Set([sourceA, sourceB])) cell.temperature += reaction.heat * amount / Math.max(0.1, cell.mass * this.props(cell).heatCapacity);
      if (!this.reactionEvents.has(reaction.id)) { this.log(`${reaction.name}: ${this.ingredients.get(reaction.product)!.name} formed`); this.reactionEvents.add(reaction.id); }
    }
  }

  stir(x: number, y: number, dx: number, dy: number): void {
    if (![x, y, dx, dy].every(Number.isFinite)) return;
    this.invalidateAggregates();
    const strength = clamp(Math.hypot(dx, dy) / 4, 0.08, 1);
    for (let yy = Math.max(2, Math.floor(y - 6)); yy <= Math.min(54, Math.ceil(y + 6)); yy++) for (let xx = Math.max(6, Math.floor(x - 6)); xx <= Math.min(58, Math.ceil(x + 6)); xx++) {
      const cell = this.at(xx, yy);
      const distance = Math.hypot(xx - x, yy - y);
      if (!cell || distance > 6) continue;
      const falloff = 1 - distance / 7;
      cell.agitation = clamp(cell.agitation + strength * falloff * 0.65, 0, 1);
      if (cell.phase !== 'solid') { cell.vx = clamp(cell.vx + dx * falloff * 3, -18, 18); cell.vy = clamp(cell.vy + dy * falloff * 3, -18, 18); }
    }
    if (this.events[this.events.length - 1] !== 'Stirred the mixture') this.log('Stirred the mixture');
  }

  crush(x: number, y: number): void {
    this.invalidateAggregates();
    let crushed = false;
    for (let yy = Math.max(12, Math.floor(y - 3)); yy <= Math.min(54, Math.ceil(y + 3)); yy++) for (let xx = Math.max(6, Math.floor(x - 3)); xx <= Math.min(58, Math.ceil(x + 3)); xx++) {
      const cell = this.at(xx, yy);
      if (!cell || Math.hypot(xx - x, yy - y) > 3) continue;
      if (cell.phase === 'solid') { cell.phase = 'powder'; crushed = true; }
      if (cell.phase === 'powder' || cell.phase === 'paste') { cell.agitation = 1; cell.vx = (xx - x) * 2; cell.vy = -3; crushed = true; }
    }
    if (crushed) this.log('Crushed solids into smaller grains');
  }

  private measured(cells: Cell[]): PotionMetrics {
    const metrics = Object.fromEntries(EFFECTS.map(effect => [effect, 0])) as unknown as PotionMetrics;
    Object.assign(metrics, { temperature: AMBIENT, viscosity: 0, acidity: 0, volatility: 0, density: 0, homogeneity: 0, mass: cells.reduce((m, c) => m + c.mass, 0) });
    if (metrics.mass < EPSILON) return metrics;
    metrics.temperature = 0;
    const composition: Record<string, number> = {};
    for (const cell of cells) {
      metrics.temperature += cell.temperature * cell.mass / metrics.mass;
      for (const [id, mass] of Object.entries(cell.composition)) {
        const ingredient = this.ingredients.get(id);
        if (!ingredient) continue;
        composition[id] = (composition[id] || 0) + mass;
        const fraction = mass / metrics.mass;
        for (const effect of EFFECTS) metrics[effect] += ingredient.effects[effect] * fraction;
        metrics.viscosity += ingredient.viscosity * fraction * (cell.phase === 'paste' ? 1.8 : cell.phase === 'solid' ? 2.5 : 1);
        metrics.acidity += ingredient.acidity * fraction;
        metrics.volatility += ingredient.volatility * fraction;
        metrics.density += ingredient.density * fraction;
      }
    }
    let variation = 0;
    for (const cell of cells) for (const [id, mass] of Object.entries(composition)) variation += Math.abs((cell.composition[id] || 0) / cell.mass - mass / metrics.mass) * cell.mass / metrics.mass;
    metrics.homogeneity = clamp(1 - variation / 2, 0, 1);
    return metrics;
  }

  metrics(): PotionMetrics {
    this.ensureAggregates();
    if (!this.cachedMetrics) this.cachedMetrics = this.measured(this.cells.filter((c): c is Cell => !!c));
    return { ...this.cachedMetrics };
  }

  /** Fingerprint ratios and measured physical state, excluding batch size. */
  signature(): string {
    this.ensureAggregates();
    if (this.cachedSignature) return this.cachedSignature;
    const cells = this.cells.filter((c): c is Cell => !!c);
    const metrics = this.metrics();
    const composition: Record<string, number> = {};
    const phases: Partial<Record<Phase, number>> = {};
    for (const cell of cells) { phases[cell.phase] = (phases[cell.phase] || 0) + cell.mass; for (const [id, mass] of Object.entries(cell.composition)) composition[id] = (composition[id] || 0) + mass; }
    const input = [Object.entries(composition).sort(([a], [b]) => a.localeCompare(b)).map(([id, mass]) => `${id}:${Math.round(mass / Math.max(metrics.mass, EPSILON) * 1000)}`).join(','), Math.round(metrics.temperature), Math.round(metrics.homogeneity * 20), Object.entries(phases).sort().map(([phase, mass]) => `${phase}:${Math.round(mass / Math.max(metrics.mass, EPSILON) * 20)}`).join(',')].join('|');
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    this.cachedSignature = `PB-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    return this.cachedSignature;
  }

  takeSample(amount: number, remove = true): Sample | null {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const total = this.totalMass();
    if (total < EPSILON) return null;
    const fraction = Math.min(amount, total) / total;
    const signature = this.signature();
    const parcels: Cell[] = [];
    const composition: Record<string, number> = {};
    for (let index = 0; index < this.cells.length; index++) {
      const cell = this.cells[index];
      if (!cell) continue;
      const parcel = copyCell(cell);
      parcel.mass *= fraction;
      for (const id of Object.keys(parcel.composition)) { parcel.composition[id] *= fraction; composition[id] = (composition[id] || 0) + parcel.composition[id]; }
      parcels.push(parcel);
      if (remove) { for (const id of Object.keys(cell.composition)) cell.composition[id] *= 1 - fraction; cell.mass *= 1 - fraction; this.clean(index); }
    }
    if (remove) this.invalidateAggregates();
    return { composition, mass: Math.min(amount, total), metrics: this.measured(parcels), signature, steps: [...this.events] };
  }
  sample(amount: number): Sample | null { return this.takeSample(amount, true); }
  peekSample(amount = 6): Sample | null { return this.takeSample(amount, false); }

  /** Fractional collection selects real hot vapor; a cold still cannot conjure a distillate. */
  distill(amount = 30): Sample | null {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const parcels: Cell[] = [];
    const composition: Record<string, number> = {};
    let remaining = amount;
    const candidates = this.cells.map((cell, index) => ({ cell, index })).filter((entry): entry is { cell: Cell; index: number } => !!entry.cell).sort((a, b) => (a.cell.phase === 'gas' ? -1 : 1) - (b.cell.phase === 'gas' ? -1 : 1) || this.props(a.cell).boiling - this.props(b.cell).boiling);
    for (const { cell, index } of candidates) {
      if (remaining <= EPSILON) break;
      for (const [id, mass] of Object.entries(cell.composition).sort(([a], [b]) => this.ingredients.get(a)!.boiling - this.ingredients.get(b)!.boiling)) {
        const ingredient = this.ingredients.get(id)!;
        if (cell.phase !== 'gas' && cell.temperature < ingredient.boiling - 5) continue;
        const quantity = Math.min(mass, remaining);
        if (quantity <= EPSILON) continue;
        composition[id] = (composition[id] || 0) + quantity;
        parcels.push({ ...cell, mass: quantity, composition: { [id]: quantity }, phase: 'liquid' });
        cell.composition[id] -= quantity; cell.mass -= quantity; remaining -= quantity;
      }
      this.invalidate(cell);
      this.clean(index);
    }
    if (!parcels.length) return null;
    this.invalidateAggregates();
    this.log('Collected the lowest-boiling vapor fraction');
    const metrics = this.measured(parcels);
    return { composition, mass: metrics.mass, metrics, signature: this.signature(), steps: [...this.events] };
  }

  snapshot(): SimulationSnapshot { return { width: this.width, height: this.height, cells: this.cells.map(cell => cell ? copyCell(cell) : null), heat: this.heat, lid: this.lid, elapsed: this.elapsed, escaped: this.escaped, oxygen: this.oxygen, events: [...this.events], ticks: this.ticks, remainder: this.remainder, lidTemperature: this.lidTemperature, heatEfficiency: this.heatEfficiency, coolingEfficiency: this.coolingEfficiency }; }
  clear(): void { this.invalidateAggregates(); this.cells.fill(null); this.heat = 0; this.elapsed = 0; this.escaped = 0; this.oxygen = 1; this.remainder = 0; this.ticks = 0; this.events = []; this.reactionEvents.clear(); this.lidTemperature = AMBIENT; this.propertiesCache = new WeakMap(); this.dominantCache = new WeakMap(); }
}
