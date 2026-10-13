import { EFFECTS, type Bottle, type Commission, type Experiment, type ExperimentSubject, type GameState, type PotionMetrics, type Recipe, type Requirement, type Sample, type Upgrade, type World } from '../core/types';
import { Simulation } from '../core/simulation';
import { getIngredient } from './world';

export const UPGRADES: Upgrade[] = [
  {id:'larger-still',name:'Copper cauldron',description:'Increase working capacity from 1,100 to 1,800 units.',price:90,reputation:0},
  {id:'furnace',name:'Bellows furnace',description:'Raises the heating range for faster melting and high-temperature reactions.',price:120,reputation:8},
  {id:'cooling-coil',name:'Frostwater coil',description:'Doubles active cooling strength for delicate and frosty preparations.',price:95,reputation:8},
  {id:'auto-mixer',name:'Clockwork stirrer',description:'A slow paddle continuously circulates the mixture when the heat is on.',price:180,reputation:18},
  {id:'analyzer',name:'Prismatic analyzer',description:'Each test also measures temperature, viscosity, volatility, density, and homogeneity.',price:210,reputation:24},
  {id:'distillery',name:'Condensing alembic',description:'Collect actual hot vapor as a separate, concentrated bottle. Open the lid and heat volatile material first.',price:260,reputation:32},
];
export const SUBJECTS: ExperimentSubject[] = [
  {id:'training-dummy',name:'Oak sentinel',icon:'♜',description:'A patient wooden warrior measures force and protective wards.',reveals:['strength','protection','density']},
  {id:'moon-seed',name:'Moonseed sprout',icon:'❦',description:'A living seedling reveals healing and harm through new growth.',reveals:['healing','toxicity','acidity']},
  {id:'glass-moth',name:'Glasswing moth',icon:'ʚɞ',description:'This small fantasy creature reacts to attraction, warmth, and frost.',reveals:['attraction','warmth','frost']},
  {id:'prism-wisp',name:'Prism salamander',icon:'✧',description:'A tiny magical creature shifts color with energy and transformation.',reveals:['energy','transformation','volatility']},
  {id:'mineral-slate',name:'Rune mineral',icon:'◇',description:'An etched mineral changes shape and corrodes in acidic or poisonous mixtures.',reveals:['acidity','transformation','toxicity']},
];
const REGIONS = [
  {id:'garden',name:'Walled garden',icon:'❦',description:'Free spring water, herbs, frost salt, oil, and rose dew. Each patch regrows after 45 seconds, including while away.',reputation:0},
  {id:'fen',name:'Whispering fen',icon:'♧',description:'Dense moss, soothing resins, conductive dust, venom, and alkaline ash.',reputation:12},
  {id:'peaks',name:'Frostglass peaks',icon:'△',description:'Glacier crystals, volatile cloud-milk, dragon blood, and phoenix feathers.',reputation:35},
  {id:'ruins',name:'Astral ruins',icon:'✵',description:'Unstable inks, starlight crystals, and ancient mandrakes.',reputation:70},
];
const starter = ['water','emberroot','moonleaf','frost-salt','sun-oil','rose-dew'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));
let idSequence = 0;
const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++idSequence).toString(36)}`;
const requirement = (property: keyof PotionMetrics, label: string, min?: number, max?: number, weight=1): Requirement => ({property,label,min,max,weight});

/** Commissions rise with unlocked regions; every one can be met by available ingredients. */
function commission(sales: number, reputation: number): Commission {
  const people = [
    {customer:'Bram',role:'The tired blacksmith',portrait:'⚒',title:'A steady hand',dialogue:'The forge has been busy. A little strength and warmth will see me through the evening.'},
    {customer:'Elowen',role:'Village herbalist',portrait:'❦',title:'A gentle remedy',dialogue:'Bring life back to a weary patient. The remedy must be kind, with very little poison.'},
    {customer:'Mira',role:'Mountain courier',portrait:'△',title:'A winter ward',dialogue:'The northern road bites. I need protection and a touch of frost magic, kept safe enough to drink.'},
    {customer:'Pip',role:'Festival storyteller',portrait:'♬',title:'A charming entrance',dialogue:'The festival audience is a difficult crowd. A friendly glow would help my tale find their hearts.'},
    {customer:'Orin',role:'Arcane surveyor',portrait:'✵',title:'Light the old runes',dialogue:'A modest current of magical energy will wake the marks on my map.'},
    {customer:'Sable',role:'Keeper of the ruins',portrait:'◇',title:'A shifting veil',dialogue:'I need transformation without reckless poison. Keep the brew gentle enough for travel.'},
  ];
  const index = sales < 4 ? sales : (sales % (reputation >= 70 ? 6 : reputation >= 12 ? 5 : 4));
  const customer = people[index];
  const difficulty = Math.min(12, Math.floor(sales / 4) * 2);
  const requests: Requirement[][] = [
    [requirement('strength','Strength',22+difficulty),requirement('warmth','Warmth',12,undefined,.8),requirement('toxicity','Toxicity',undefined,20,1.2)],
    [requirement('healing','Healing',30+difficulty),requirement('toxicity','Toxicity',undefined,12,1.4),requirement('acidity','Balanced acidity',5,9,.5)],
    [requirement('protection','Protection',22+difficulty),requirement('frost','Frost',20+difficulty),requirement('toxicity','Toxicity',undefined,15,1.2)],
    [requirement('attraction','Attraction',25+difficulty),requirement('toxicity','Toxicity',undefined,14,1.2)],
    [requirement('energy','Energy',28+difficulty),requirement('toxicity','Toxicity',undefined,22,1.2)],
    [requirement('transformation','Transformation',35+difficulty),requirement('toxicity','Toxicity',undefined,24,1.3)],
  ];
  return {id:sales,...customer,budget:45+sales*5+index*5,requirements:requests[index]};
}
function initialState(world: World): GameState {
  return {version:1,seed:world.seed,coins:75,reputation:0,day:1,sales:0,
    inventory:{water:144,emberroot:96,moonleaf:96,'frost-salt':72,'sun-oil':72,'rose-dew':48},
    upgrades:[],journal:[],recipes:[],bottles:[],commission:commission(0,0),gathered:{},achievements:[],tutorial:0,
    settings:{sound:true,volume:.55,quality:'auto',reducedMotion:false},simulation:null,steps:[],mode:'shop'};
}

export class Game {
  state: GameState;
  sim: Simulation;
  lastMessage = 'Your first commission awaits. Combine water and emberroot, then test a real sample.';
  private shopState: GameState | null = null;
  private shopSim: Simulation | null = null;
  private sandboxState: GameState | null = null;
  private sandboxSim: Simulation | null = null;
  private mixerClock = 0;
  private requestedHeat = 0;
  private lastRecordedElapsed = 0;
  private added: Record<string, number> = {};

  constructor(public world: World, state?: GameState) {
    this.state = state ? clone(state) : initialState(world);
    this.state.seed = world.seed;
    this.state.mode = 'shop';
    this.sim = new Simulation(world,this.state.simulation);
    this.requestedHeat = this.sim.heat;
    this.lastRecordedElapsed = this.sim.elapsed;
    this.applyUpgrades();
    this.rebuildAdditions();
  }
  get rank(): string { return this.state.reputation >= 100 ? 'Master alchemist' : this.state.reputation >= 70 ? 'Astral adept' : this.state.reputation >= 35 ? 'Guild alchemist' : this.state.reputation >= 12 ? 'Journeyman' : 'Apprentice'; }
  regions() { return REGIONS.map(region => ({...region})); }
  isUnlocked(id: string): boolean {
    const ingredient = this.world.ingredients.find(item=>item.id===id);
    if (!ingredient || ingredient.region === 'laboratory') return false;
    return this.state.mode === 'sandbox' || this.state.reputation >= (REGIONS.find(region=>region.id===ingredient.region)?.reputation ?? Infinity);
  }
  private achievement(id: string) { if (!this.state.achievements.includes(id)) this.state.achievements.push(id); }
  private applyUpgrades() {
    this.sim.capacity = this.state.upgrades.includes('larger-still') ? 1800 : 1100;
    this.sim.heatEfficiency = this.state.upgrades.includes('furnace') ? 1.5 : 1;
    this.sim.coolingEfficiency = this.state.upgrades.includes('cooling-coil') ? 1.8 : 1;
  }
  private rebuildAdditions() {
    this.added = {};
    for (const step of this.state.steps) {
      const match = /^Add ([\d.]+)u (.+?)(?: at |$)/.exec(step);
      if (!match) continue;
      const ingredient = this.world.ingredients.find(item=>item.name===match[2].replace(/\.$/,''));
      if (ingredient) this.added[ingredient.id]=(this.added[ingredient.id]??0)+Number(match[1]);
    }
  }
  private recordWait() {
    const duration=this.sim.elapsed-this.lastRecordedElapsed;
    if (duration>=.5 && this.state.steps.length && this.state.steps.length<299) this.state.steps.push(`Keep the current preparation for ${duration.toFixed(1)} seconds.`);
    this.lastRecordedElapsed=this.sim.elapsed;
  }
  private record(step: string) { this.recordWait(); if (this.state.steps.length < 300) this.state.steps.push(step); }
  addIngredient(id: string, amount = 24, x?: number): boolean {
    const material = this.world.ingredients.find(item=>item.id===id);
    if (!material || !Number.isFinite(amount) || amount <= 0) { this.lastMessage='Choose a valid ingredient and amount.'; return false; }
    if (this.state.mode !== 'sandbox' && !this.isUnlocked(id)) { this.lastMessage='Earn more reputation to reach this gathering region.'; return false; }
    const stock = this.state.mode==='sandbox' ? amount : (this.state.inventory[id]??0);
    if (stock<=0) { this.lastMessage='Your jar is empty. Gather a fresh portion for free or buy a refill.'; return false; }
    const accepted = this.sim.add(id,Math.min(amount,stock),x);
    if (accepted<=0) { this.lastMessage='The cauldron is full. Bottle or empty it to make space.'; return false; }
    if (this.state.mode==='shop') this.state.inventory[id]=Math.max(0,stock-accepted);
    this.added[id]=(this.added[id]??0)+accepted;
    this.record(`Add ${accepted.toFixed(1)}u ${material.name}${x===undefined?'':` at ${Math.round(x)}`}.`);
    this.state.tutorial=Math.max(this.state.tutorial,1);
    this.lastMessage=`Added ${accepted.toFixed(0)} units of ${material.name}.`;
    return true;
  }
  setHeat(value: number): void {
    if (!Number.isFinite(value)) return;
    const bounded = clamp(value,-1,1);
    this.requestedHeat=bounded;
    this.sim.heat=bounded;
    this.record(bounded===0?'Turn off the heat.':`${bounded<0?'Cool':'Heat'} at ${Math.round(Math.abs(bounded)*100)}%.`);
    this.state.tutorial=Math.max(this.state.tutorial,2);
    this.lastMessage=bounded<0?'Frostwater draws warmth from the vessel.':bounded>0?'The furnace warms the vessel from below.':'The vessel rests at ambient temperature.';
  }
  toggleLid(): void { this.sim.lid=!this.sim.lid; this.record(`${this.sim.lid?'Close':'Open'} the lid.`); this.lastMessage=this.sim.lid?'Lid closed: volatile vapors remain in the vessel.':'Lid open: steam and volatile material may escape.'; }
  stir(x: number,y: number,dx: number,dy: number): void {
    this.sim.stir(x,y,dx,dy);
    const last=this.state.steps.at(-1);
    if (!last?.startsWith('Stir')) this.record('Stir across the vessel, bringing layers into contact.');
    this.state.tutorial=Math.max(this.state.tutorial,2);
    this.lastMessage='The paddle draws the mixture into a circulating current.';
  }
  crush(x: number,y: number): void { this.sim.crush(x,y); this.record(`Crush solids near ${Math.round(x)}, ${Math.round(y)}.`); this.lastMessage='Exposed surfaces help solids dissolve and react.'; this.achievement('grindstone'); }
  tick(dt: number): void {
    this.sim.step(dt);
    if (this.state.upgrades.includes('auto-mixer') && this.requestedHeat!==0) {
      this.mixerClock+=dt;
      if (this.mixerClock>.25) {
        this.mixerClock=0;
        if (this.sim.cells.some(cell=>cell!==null)) {
          const t=this.sim.elapsed*1.7;
          this.sim.stir(this.sim.width*.5+Math.sin(t)*this.sim.width*.11,this.sim.height*.91+Math.cos(t)*this.sim.height*.04,Math.cos(t)*7,-Math.sin(t)*5);
        }
      }
    }
    if (this.sim.events.some(event=>/reaction|forms|formed|coupling|weaving|neutral|emulsion|release|binding|bloom/i.test(event))) this.achievement('first-reaction');
  }
  test(subjectId: string): Experiment | null {
    const subject=SUBJECTS.find(item=>item.id===subjectId);
    if (!subject) { this.lastMessage='Choose an experiment subject.'; return null; }
    if (this.sim.metrics().mass<6) { this.lastMessage='An experiment needs at least 6 units of real potion.'; return null; }
    this.recordWait();
    const signature=this.sim.signature();
    const sample=this.sim.sample(6);
    if (!sample) return null;
    const reveals=[...subject.reveals];
    if (this.state.upgrades.includes('analyzer')) reveals.push('temperature','viscosity','volatility','density','homogeneity');
    const metrics: Partial<PotionMetrics>={};
    for (const key of reveals) metrics[key]=sample.metrics[key];
    const observation = this.describeObservation(subjectId,sample);
    const experiment:Experiment={id:uniqueId('test'),subject:subjectId,name:subject.name,signature,metrics,observation,composition:{...sample.composition},steps:[...this.state.steps],time:Date.now()};
    this.state.journal.unshift(experiment); this.state.journal=this.state.journal.slice(0,160);
    this.state.tutorial=Math.max(this.state.tutorial,3);
    this.achievement('first-experiment');
    if (new Set(this.state.journal.map(item=>item.subject)).size>=SUBJECTS.length) this.achievement('field-scholar');
    this.lastMessage=`${subject.name} tested 6 units. ${observation}`;
    return experiment;
  }
  private describeObservation(subject: string,sample: Sample): string {
    const p=sample.metrics;
    if (subject==='training-dummy') return p.strength>=22?'The sentinel drives a deep mark into its oak target.':p.protection>=20?'A pale ward softens the blows against the sentinel.':'The sentinel moves with little extra force.';
    if (subject==='moon-seed') return p.toxicity>20?'The sprout darkens; this brew contains harmful compounds.':p.healing>=30?'Fresh leaves unfurl from the moonseed.':'The seedling remains small and quiet.';
    if (subject==='glass-moth') return p.attraction>=25?'The glasswing circles the vial in bright, eager loops.':p.frost>=20?'Cold crystals gather on the moth’s perch.':p.warmth>=15?'The glasswing settles in the warm glow.':'The glasswing keeps a cautious distance.';
    if (subject==='mineral-slate') return p.acidity<4?'The rune etching corrodes in the acidic sample.':p.transformation>30?'The crystal lattice folds into a new pattern.':'The runes remain mostly unchanged.';
    return p.energy>=25?'The salamander’s scales flare with a magical current.':p.transformation>=30?'The salamander shifts its prism-colored scales.':'The salamander gives only a faint shimmer.';
  }
  currentVerification(): Partial<PotionMetrics> {
    const signature=this.sim.signature(); const verified:Partial<PotionMetrics>={};
    for (const entry of [...this.state.journal].reverse()) if (entry.signature===signature) Object.assign(verified,entry.metrics);
    return verified;
  }
  predict(): Partial<PotionMetrics> {
    const prediction:Partial<PotionMetrics>={};
    const entries=Object.entries(this.added).filter(([id])=>this.world.ingredients.some(item=>item.id===id&&item.region!=='laboratory'));
    const total=entries.reduce((sum,[,amount])=>sum+amount,0);
    if (!total) return prediction;
    for (const effect of EFFECTS) prediction[effect]=entries.reduce((sum,[id,amount])=>sum+getIngredient(this.world,id).effects[effect]*amount/total,0);
    prediction.acidity=entries.reduce((sum,[id,amount])=>sum+getIngredient(this.world,id).acidity*amount/total,0);
    for (const key of Object.keys(prediction) as (keyof PotionMetrics)[]) prediction[key]=Number(prediction[key]!.toFixed(6));
    return prediction;
  }
  bottle(name?: string): Bottle | null {
    const mass=this.sim.metrics().mass;
    if (mass<12) { this.lastMessage='A saleable bottle needs at least 12 units of real potion.'; return null; }
    this.recordWait();
    const sample=this.sim.sample(Math.min(30,mass));
    if (!sample) return null;
    sample.steps=[...this.state.steps];
    const bottle:Bottle={id:uniqueId('bottle'),name:name?.trim().slice(0,60)||`Batch ${this.state.bottles.length+1}`,sample};
    this.state.bottles.unshift(bottle);
    this.state.tutorial=Math.max(this.state.tutorial,4); this.achievement('first-bottle');
    this.lastMessage=`Bottled ${sample.mass.toFixed(0)} units as “${bottle.name}”.`;
    if (this.sim.metrics().mass<.5) { this.state.steps=[]; this.added={}; }
    return bottle;
  }
  distill(name?: string): Bottle | null {
    if (!this.state.upgrades.includes('distillery')) { this.lastMessage='Install a condensing alembic to collect vapor.'; return null; }
    this.recordWait();
    const sample=this.sim.distill(30);
    if (!sample || sample.mass<1) { this.lastMessage='No hot vapor to collect. Open the lid and heat a volatile mixture near its boiling point.'; return null; }
    sample.steps=[...this.state.steps,'Collect hot vapor through the condensing alembic.'];
    const bottle:Bottle={id:uniqueId('distillate'),name:name?.trim().slice(0,60)||'Collected distillate',sample};
    this.state.bottles.unshift(bottle); this.achievement('distiller'); this.lastMessage=`Collected ${sample.mass.toFixed(1)} units of actual vapor as a separate distillate.`;
    return bottle;
  }
  sell(bottleId: string): {quality:number,payment:number,reputation:number,message:string} | null {
    if (this.state.mode==='sandbox') { this.lastMessage='Switch to the shop to serve your waiting customer.'; return null; }
    const bottle=this.state.bottles.find(item=>item.id===bottleId);
    if (!bottle) return null;
    let earned=0,total=0,weakestFit=1;
    for (const req of this.state.commission.requirements) {
      const value=bottle.sample.metrics[req.property]; let fit=1;
      if (req.min!==undefined && value<req.min) fit*=clamp(value/Math.max(.001,req.min));
      if (req.max!==undefined && value>req.max) fit*=clamp(req.max/Math.max(.001,value));
      if (req.target!==undefined) fit*=clamp(1-Math.abs(value-req.target)/Math.max(10,Math.abs(req.target)));
      earned+=fit*req.weight; total+=req.weight; weakestFit=Math.min(weakestFit,fit);
    }
    // One missing requested property cannot be hidden behind harmlessness in other measurements.
    const quality=clamp(earned/Math.max(1,total)*weakestFit);
    const payment=Math.round(this.state.commission.budget*(.2+.8*quality));
    const reputation=quality>=.9?8:quality>=.7?5:quality>=.5?2:0;
    this.state.coins+=payment; this.state.reputation+=reputation; this.state.sales++;
    this.state.day=1+Math.floor(this.state.sales/3);
    this.state.bottles=this.state.bottles.filter(item=>item.id!==bottleId);
    this.state.tutorial=5; this.achievement('first-sale');
    if (quality>=.98) this.achievement('perfect-commission');
    if (this.state.sales>=5) this.achievement('shopkeeper');
    if (this.state.reputation>=70) this.achievement('astral-explorer');
    const message=quality>=.9?'A delighted customer!':quality>=.7?'The customer appreciates your careful work.':quality>=.5?'Useful, but the customer noticed room for improvement.':'The customer pays a small salvage price; study the measurements before the next batch.';
    this.lastMessage=`${message} +${payment} coins, +${reputation} reputation.`;
    this.state.commission=commission(this.state.sales,this.state.reputation);
    return {quality,payment,reputation,message};
  }
  gather(region: string,ingredientId?: string): {id:string,amount:number} | null {
    const area=REGIONS.find(item=>item.id===region);
    if (!area || this.state.mode==='shop'&&this.state.reputation<area.reputation) { this.lastMessage='This gathering path is still locked. Serve customers to earn reputation.'; return null; }
    const available=this.world.ingredients.filter(item=>item.region===region);
    const now=Date.now();
    const material=ingredientId?available.find(item=>item.id===ingredientId):available.find(item=>item.id!=='water'&&now-(this.state.gathered[item.id]??0)>=45000)??available.find(item=>item.id==='water');
    if (!material) { this.lastMessage='There are no accessible materials on this path.'; return null; }
    const last=this.state.gathered[material.id]??0;
    if (material.id!=='water'&&now-last<45000&&this.state.mode==='shop') { this.lastMessage=`This patch regrows in ${Math.ceil((45000-now+last)/1000)} seconds. Try another ingredient or gather free water.`; return null; }
    const amount=material.id==='water'?72:48;
    this.state.inventory[material.id]=(this.state.inventory[material.id]??0)+amount;
    this.state.gathered[material.id]=now;
    this.achievement('first-forage'); this.lastMessage=`Gathered ${amount} units of ${material.name} for free.`;
    return {id:material.id,amount};
  }
  buyIngredient(id: string,amount=24): boolean {
    if (!this.isUnlocked(id)||!Number.isFinite(amount)||amount<=0) { this.lastMessage='This ingredient is not yet available from the merchant.'; return false; }
    const material=getIngredient(this.world,id); const price=Math.ceil(material.price*amount/24);
    if (this.state.coins<price) { this.lastMessage='Not enough coins. You can always gather unlocked ingredients for free.'; return false; }
    this.state.coins-=price; this.state.inventory[id]=(this.state.inventory[id]??0)+amount;
    this.lastMessage=`Bought ${amount} units of ${material.name} for ${price} coins.`; return true;
  }
  buyUpgrade(id: string): boolean {
    const upgrade=UPGRADES.find(item=>item.id===id);
    if (!upgrade || this.state.upgrades.includes(id)) { this.lastMessage='That equipment is already installed.'; return false; }
    if (this.state.reputation<upgrade.reputation) { this.lastMessage=`This equipment requires ${upgrade.reputation} reputation.`; return false; }
    if (this.state.coins<upgrade.price) { this.lastMessage=`You need ${upgrade.price} coins for this equipment.`; return false; }
    this.state.coins-=upgrade.price; this.state.upgrades.push(id); this.applyUpgrades(); this.setHeat(this.requestedHeat); this.achievement('workshop');
    this.lastMessage=`Installed ${upgrade.name}. ${upgrade.description}`; return true;
  }
  saveRecipe(name: string,experimentId?: string): Recipe | null {
    const experiment=experimentId?this.state.journal.find(item=>item.id===experimentId):this.state.journal.find(item=>item.signature===this.sim.signature());
    if (!experiment) { this.lastMessage='Test this mixture before saving its measured recipe, or choose a past journal experiment.'; return null; }
    const matching=this.state.journal.filter(item=>item.signature===experiment.signature);
    const metrics:Partial<PotionMetrics>={}; for (const item of matching.reverse()) Object.assign(metrics,item.metrics);
    const recipe:Recipe={id:uniqueId('recipe'),name:name.trim().slice(0,60)||'Untitled discovery',composition:{...experiment.composition},steps:[...experiment.steps],metrics,signature:experiment.signature};
    this.state.recipes.unshift(recipe); this.state.recipes=this.state.recipes.slice(0,100); this.achievement('first-recipe');
    this.lastMessage=`Saved “${recipe.name}” with manual preparation steps and measured results.`; return recipe;
  }
  emptyCauldron(): void { this.sim.clear(); this.state.steps=[]; this.added={}; this.requestedHeat=0; this.lastRecordedElapsed=0; this.lastMessage='The cauldron is clean and ready for a new experiment.'; }
  switchMode(mode: 'shop'|'sandbox'): void {
    if (mode===this.state.mode) return;
    this.state.simulation=this.sim.snapshot();
    if (mode==='sandbox') {
      this.shopState=this.state; this.shopSim=this.sim;
      if (!this.sandboxState) {
        this.sandboxState=initialState(this.world); this.sandboxState.mode='sandbox'; this.sandboxState.reputation=1000; this.sandboxState.coins=99999;
        this.sandboxState.upgrades=UPGRADES.map(item=>item.id);
        this.sandboxState.inventory=Object.fromEntries(this.world.ingredients.map(item=>[item.id,99999]));
        this.sandboxSim=new Simulation(this.world);
      }
      this.state=this.sandboxState; this.sim=this.sandboxSim!;
    } else {
      this.sandboxState=this.state; this.sandboxSim=this.sim;
      this.state=this.shopState!; this.sim=this.shopSim!;
    }
    this.requestedHeat=this.sim.heat; this.lastRecordedElapsed=this.sim.elapsed; this.applyUpgrades(); this.rebuildAdditions();
    this.lastMessage=mode==='sandbox'?'Sandbox: unlimited ingredients and equipment, with a separate vessel.':'Welcome back to your shop. Your customer and working batch were preserved.';
  }
  exportState(): GameState {
    const state=this.state.mode==='sandbox'?this.shopState!:this.state;
    const sim=this.state.mode==='sandbox'?this.shopSim!:this.sim;
    return clone({...state,version:1,mode:'shop',simulation:sim.snapshot()});
  }
}
