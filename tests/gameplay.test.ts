import { describe, expect, it, vi, afterEach } from 'vitest';
import { Game, SUBJECTS, UPGRADES } from '../src/game/game';
import { createWorld, getIngredient } from '../src/game/world';

const batch = (seed='guild') => { const game=new Game(createWorld(seed)); game.addIngredient('water',24); game.addIngredient('emberroot',24); return game; };
function serve(game: Game,id: string) { game.emptyCauldron();game.addIngredient('water',24);game.addIngredient(id,48);const bottle=game.bottle();expect(bottle).not.toBeNull();return game.sell(bottle!.id)!; }
afterEach(()=>vi.restoreAllMocks());

describe('seeded material world',()=>{
  it('reproduces material properties, names, and reaction conditions for the same seed',()=>{
    expect(createWorld('saffron')).toEqual(createWorld('saffron'));
    expect(createWorld('saffron')).not.toEqual(createWorld('indigo'));
    expect(createWorld('saffron').ingredients.length).toBeGreaterThanOrEqual(20);
  });
  it('generates diverse physical materials and valid, achievable chemistry',()=>{
    const world=createWorld('saffron');
    expect(new Set(world.ingredients.map(i=>i.phase)).size).toBe(5);
    expect(getIngredient(world,'sun-oil').miscibility).not.toBe(getIngredient(world,'water').miscibility);
    expect(getIngredient(world,'frost-salt').density).toBeGreaterThan(getIngredient(world,'sun-oil').density);
    for(const reaction of world.reactions){expect(getIngredient(world,reaction.a)).toBeTruthy();expect(getIngredient(world,reaction.b)).toBeTruthy();expect(getIngredient(world,reaction.product)).toBeTruthy();expect(reaction.minTemp).toBeLessThan(reaction.maxTemp);}
  });
});

describe('experimental shop loop',()=>{
  it.each(['guild','moonlight','volcano','zero','🍃'])('makes the first four commissions achievable in seed %s',seed=>{
    const game=new Game(createWorld(seed));
    const solutions=['emberroot','moonleaf','frost-salt','rose-dew'];
    for(const id of solutions){
      const sale=serve(game,id);
      expect(sale.quality).toBeGreaterThan(.95);
      expect(sale.reputation).toBe(8);
      expect(sale.payment).toBeGreaterThan(35);
    }
    expect(game.state.reputation).toBe(32);expect(game.state.sales).toBe(4);expect(game.state.coins).toBeGreaterThan(250);
  });
  it('consumes a real sample and each subject reveals only its relevant measurements',()=>{
    const game=batch(); const before=game.sim.metrics().mass;
    const force=game.test('training-dummy')!;
    expect(game.sim.metrics().mass).toBeCloseTo(before-6);
    expect(force.metrics.strength).toBeGreaterThan(20);
    expect(force.metrics.healing).toBeUndefined();expect(force.metrics.toxicity).toBeUndefined();
    const life=game.test('moon-seed')!;
    expect(life.metrics.healing).toBeDefined();expect(life.metrics.toxicity).toBeDefined();expect(life.metrics.warmth).toBeUndefined();
    expect(Object.keys(game.currentVerification())).toContain('toxicity');
  });
  it('invalidates exact verification after a composition or temperature change',()=>{
    const game=batch();game.test('training-dummy');expect(game.currentVerification().strength).toBeDefined();
    game.addIngredient('moonleaf',24);expect(game.currentVerification().strength).toBeUndefined();
    game.test('moon-seed');expect(game.currentVerification().healing).toBeDefined();
    for(const cell of game.sim.cells) if(cell) cell.temperature+=12;
    expect(game.currentVerification().healing).toBeUndefined();
  });
  it('keeps hypotheses separate from measurements and restores them after loading',()=>{
    const game=batch();const predicted=game.predict();expect(predicted.strength).toBeGreaterThan(20);expect(game.currentVerification()).toEqual({});
    const saved=game.exportState();const restored=new Game(createWorld(saved.seed),saved);
    expect(restored.predict()).toEqual(predicted);expect(restored.sim.metrics().mass).toBeCloseTo(game.sim.metrics().mass);
  });
  it('saves measured recipes with manual preparation steps and merges matching tests',()=>{
    const game=batch();expect(game.saveRecipe('Ungrounded')).toBeNull();
    const first=game.test('training-dummy')!;game.test('moon-seed');
    const recipe=game.saveRecipe('Forge cordial',first.id)!;
    expect(recipe.metrics.strength).toBeDefined();expect(recipe.metrics.toxicity).toBeDefined();
    expect(recipe.steps.some(step=>step.includes('Emberroot'))).toBe(true);
    expect(recipe.steps.some(step=>step.includes('24.0u'))).toBe(true);
    game.addIngredient('moonleaf');expect(game.saveRecipe('Wrong batch')).toBeNull();
  });
  it('preserves a separate shop batch and economy through unlimited sandbox experiments',()=>{
    const game=batch();const before=game.exportState();game.switchMode('sandbox');
    expect(game.state.mode).toBe('sandbox');expect(game.sim.metrics().mass).toBe(0);
    expect(game.addIngredient('void-ink',100)).toBe(true);
    expect(game.state.inventory['void-ink']).toBe(99999);
    expect(game.exportState()).toEqual(before);
    game.switchMode('shop');expect(game.state.coins).toBe(before.coins);expect(game.sim.metrics().mass).toBeCloseTo(48);expect(game.predict().strength).toBeGreaterThan(20);
  });
  it('cannot softlock an empty purse: gathering is free and plants regenerate while offline',()=>{
    const game=new Game(createWorld('forage'));game.state.coins=0;game.state.inventory={};
    expect(game.buyIngredient('emberroot')).toBe(false);
    expect(game.gather('garden','emberroot')).toEqual({id:'emberroot',amount:48});
    expect(game.gather('garden','emberroot')).toBeNull();
    expect(game.gather('garden','water')?.amount).toBe(72);
    expect(game.gather('garden','water')?.amount).toBe(72);
    game.state.gathered.emberroot=Date.now()-46000;
    expect(game.gather('garden','emberroot')?.amount).toBe(48);
    expect(game.gather('ruins','void-ink')).toBeNull();
  });
  it('applies purchased capacity to a loaded game and unlocks all five experiment subjects',()=>{
    const game=new Game(createWorld('tools'));game.state.coins=1000;game.state.reputation=100;
    expect(game.buyUpgrade('larger-still')).toBe(true);expect(game.sim.capacity).toBe(1800);
    expect(game.buyUpgrade('larger-still')).toBe(false);
    const state=game.exportState();expect(new Game(createWorld(state.seed),state).sim.capacity).toBe(1800);
    expect(SUBJECTS).toHaveLength(5);expect(UPGRADES).toHaveLength(6);
  });
  it('prices poor potions below excellent ones and takes bottled material out of the vessel',()=>{
    const game=batch();const initialMass=game.sim.metrics().mass;const bottle=game.bottle()!;
    expect(game.sim.metrics().mass).toBeCloseTo(initialMass-bottle.sample.mass);
    const good=game.sell(bottle.id)!;
    const poor=new Game(createWorld('guild'));poor.addIngredient('water',48);const water=poor.bottle()!;
    const bad=poor.sell(water.id)!;expect(bad.quality).toBeLessThan(good.quality);expect(bad.payment).toBeLessThan(good.payment);expect(bad.reputation).toBe(0);
  });

  it('serves later energy and transformation commissions and reaches every region without losing money',()=>{
    const game=new Game(createWorld('progression'));
    const supplies: Record<string,string>={strength:'emberroot',healing:'moonleaf',protection:'frost-salt',attraction:'rose-dew',energy:'spark-dust',transformation:'void-ink'};
    const seen=new Set<string>();
    for(let sale=0;sale<16;sale++){
      const property=game.state.commission.requirements[0].property;
      const id=supplies[property];seen.add(property);
      expect(game.isUnlocked(id)).toBe(true);
      game.emptyCauldron();expect(game.buyIngredient('water',24)).toBe(true);
      const dose=id==='void-ink'?30:48;expect(game.buyIngredient(id,dose)).toBe(true);
      game.addIngredient('water',24);game.addIngredient(id,dose);
      const bottle=game.bottle()!;const result=game.sell(bottle.id)!;
      expect(result.quality).toBeGreaterThan(.95);expect(result.reputation).toBe(8);
    }
    expect(seen.has('energy')).toBe(true);expect(seen.has('transformation')).toBe(true);
    expect(game.state.reputation).toBe(128);expect(game.rank).toBe('Master alchemist');
    expect(game.state.coins).toBeGreaterThan(700);
    expect(game.isUnlocked('void-ink')).toBe(true);expect(game.isUnlocked('glacier-pearl')).toBe(true);
  });
  it('furnace and cooling equipment produce measurable faster temperature changes and persist after load',()=>{
    const make=(upgrade?:string,temperature=20)=>{
      const game=new Game(createWorld('thermal-tools'));game.state.coins=1000;game.state.reputation=100;
      if(upgrade) expect(game.buyUpgrade(upgrade)).toBe(true);
      game.sim.cells[54*64+32]={composition:{water:1},mass:1,phase:'liquid',temperature,agitation:0,vx:0,vy:0};
      return game;
    };
    const plain=make(),furnace=make('furnace');plain.setHeat(1);furnace.setHeat(1);plain.tick(.3);furnace.tick(.3);
    expect(furnace.sim.heat).toBe(1);expect(furnace.sim.metrics().temperature).toBeGreaterThan(plain.sim.metrics().temperature+1);
    const slow=make(undefined,70),coil=make('cooling-coil',70);slow.setHeat(-1);coil.setHeat(-1);slow.tick(.3);coil.tick(.3);
    expect(coil.sim.heat).toBe(-1);expect(coil.sim.metrics().temperature).toBeLessThan(slow.sim.metrics().temperature-1);
    const saved=furnace.exportState();const restored=new Game(createWorld(saved.seed),saved);
    expect(restored.sim.heatEfficiency).toBe(1.5);expect(restored.sim.heat).toBe(1);
  });
  it('the clockwork paddle reaches material resting at the bottom of a lightly filled vessel',()=>{
    const game=new Game(createWorld('paddle'));game.state.coins=1000;game.state.reputation=100;
    game.buyUpgrade('auto-mixer');game.setHeat(.01);
    game.sim.cells[54*64+36]={composition:{water:1},mass:1,phase:'liquid',temperature:20,agitation:0,vx:0,vy:0};
    game.tick(.3);
    expect(game.sim.cells.some(cell=>cell&&cell.agitation>.05)).toBe(true);
  });
  it('records elapsed thermal preparation in the manual recipe and collects real distillation mass',()=>{
    const game=batch();game.setHeat(.2);game.tick(.8);const experiment=game.test('training-dummy')!;
    expect(experiment.steps.some(step=>step.includes('0.8 seconds'))).toBe(true);
    game.state.coins=1000;game.state.reputation=100;game.buyUpgrade('distillery');game.emptyCauldron();
    expect(game.distill()).toBeNull();
    game.sim.cells[40*64+32]={composition:{'sun-oil':8},mass:8,phase:'gas',temperature:120,agitation:0,vx:0,vy:0};
    const before=game.sim.metrics().mass;const bottle=game.distill()!;
    expect(bottle.sample.mass).toBeGreaterThan(0);expect(game.sim.metrics().mass+bottle.sample.mass).toBeCloseTo(before,6);
    expect(bottle.sample.composition['sun-oil']).toBeGreaterThan(0);expect(game.state.achievements).toContain('distiller');
  });
  it('does not reward water-only potions with reputation for missing desired effects',()=>{
    const game=new Game(createWorld('empty-potency'));
    for(let sale=0;sale<12;sale++){
      game.emptyCauldron();game.gather('garden','water');game.addIngredient('water',48);
      const bottle=game.bottle()!;const result=game.sell(bottle.id)!;
      expect(result.quality).toBe(0);expect(result.reputation).toBe(0);
    }
    expect(game.state.reputation).toBe(0);expect(game.isUnlocked('spark-dust')).toBe(false);
  });
  it('runs the clockwork paddle without repeatedly measuring the entire potion',()=>{
    const game=batch();game.state.upgrades.push('auto-mixer');game.setHeat(.01);
    const measure=vi.spyOn(game.sim,'metrics');
    const occupied=vi.spyOn(game.sim.cells,'some');
    for(let frame=0;frame<20;frame++) game.tick(1/60);
    expect(measure).not.toHaveBeenCalled();expect(occupied.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it('analyzer expands only physical observations, leaving unrelated magic unmeasured',()=>{
    const game=batch();game.state.upgrades.push('analyzer');const result=game.test('training-dummy')!;
    expect(result.metrics.homogeneity).toBeDefined();expect(result.metrics.viscosity).toBeDefined();expect(result.metrics.healing).toBeUndefined();
  });
});
