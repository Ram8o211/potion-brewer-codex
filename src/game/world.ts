import { EFFECTS, type Effects, type Ingredient, type Phase, type World } from '../core/types';

/** A seed controls every generated name, material property, and reaction threshold. */
function seeded(seed: string): () => number {
  let state = 2166136261;
  for (const c of seed) { state ^= c.charCodeAt(0); state = Math.imul(state, 16777619); }
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
const effects = (partial: Partial<Effects>): Effects => Object.fromEntries(EFFECTS.map(key => [key, partial[key] ?? 0])) as Effects;
interface Material { id: string; name: string; subtitle: string; color: string; icon: string; phase: Phase; tier: number; region: string; effects: Partial<Effects>; properties?: Partial<Ingredient>; }
const materials: Material[] = [
  { id:'water', name:'Spring water', subtitle:'The patient solvent', color:'#7dbde1', icon:'◒', phase:'liquid', tier:1, region:'garden', effects:{}, properties:{density:1,viscosity:.025,miscibility:'water',solubility:1,conductivity:.65,heatCapacity:1,melting:0,boiling:100,volatility:.15,acidity:7,stability:.99,price:0} },
  { id:'emberroot', name:'Emberroot', subtitle:'Strength · warmth', color:'#e78243', icon:'♜', phase:'solid', tier:1, region:'garden', effects:{strength:82,warmth:64,toxicity:14}, properties:{density:1.28,solubility:.55,melting:65,boiling:205,flammability:.48,acidity:5.5,cohesion:.7,friction:.75} },
  { id:'moonleaf', name:'Moonleaf', subtitle:'Healing · calm', color:'#83d6ae', icon:'❦', phase:'solid', tier:1, region:'garden', effects:{healing:94,protection:18,toxicity:2}, properties:{density:.82,solubility:.75,melting:48,boiling:180,flammability:.3,acidity:6.8,stability:.92} },
  { id:'frost-salt', name:'Frost salt', subtitle:'Frost · protection', color:'#b3def4', icon:'✧', phase:'powder', tier:1, region:'garden', effects:{frost:88,protection:72,warmth:-18,toxicity:8}, properties:{density:1.8,solubility:.86,melting:160,boiling:360,heatCapacity:.45,conductivity:.8,electrical:.8,acidity:8.2,friction:.25} },
  { id:'sun-oil', name:'Sun oil', subtitle:'Warmth · buoyant oil', color:'#f1c25e', icon:'◕', phase:'liquid', tier:1, region:'garden', effects:{warmth:90,energy:40,attraction:18,toxicity:12}, properties:{density:.71,viscosity:.29,miscibility:'oil',solubility:.03,melting:-12,boiling:82,volatility:.58,flammability:.88,conductivity:.2,heatCapacity:.52,acidity:6.2} },
  { id:'rose-dew', name:'Rose dew', subtitle:'Attraction · healing', color:'#e99cad', icon:'❀', phase:'liquid', tier:1, region:'garden', effects:{attraction:86,healing:32,toxicity:1}, properties:{density:1.05,viscosity:.12,solubility:1,boiling:94,acidity:5.9} },
  { id:'iron-moss', name:'Iron moss', subtitle:'Protection · weight', color:'#8da780', icon:'♣', phase:'solid', tier:2, region:'fen', effects:{protection:96,strength:40,toxicity:16}, properties:{density:1.95,solubility:.35,cohesion:.82,friction:.9,melting:120,boiling:300,electrical:.7} },
  { id:'willow-resin', name:'Willow resin', subtitle:'Viscous · soothing', color:'#aada91', icon:'⌁', phase:'paste', tier:2, region:'fen', effects:{healing:72,protection:38,toxicity:0}, properties:{density:1.1,viscosity:.88,solubility:.45,melting:36,boiling:155,cohesion:.92,acidity:7.2} },
  { id:'spark-dust', name:'Spark dust', subtitle:'Energy · conductive', color:'#f5d47d', icon:'ϟ', phase:'powder', tier:2, region:'fen', effects:{energy:98,warmth:34,toxicity:24}, properties:{density:1.55,solubility:.75,electrical:1,conductivity:.95,flammability:.6,melting:92,boiling:220,stability:.4} },
  { id:'bog-venom', name:'Bog venom', subtitle:'Toxic · acidic', color:'#bc80d5', icon:'☽', phase:'liquid', tier:2, region:'fen', effects:{toxicity:95,transformation:52,energy:28}, properties:{density:1.2,viscosity:.4,acidity:2.1,stability:.42,boiling:112,volatility:.26} },
  { id:'silver-ash', name:'Silver ash', subtitle:'Alkaline · purifying', color:'#c8c2e1', icon:'✦', phase:'powder', tier:2, region:'fen', effects:{protection:58,energy:48,toxicity:4}, properties:{density:1.45,solubility:.85,acidity:11.5,electrical:.9,melting:185,boiling:400} },
  { id:'glacier-pearl', name:'Glacier pearl', subtitle:'Frost · dense crystal', color:'#91c9ed', icon:'◇', phase:'solid', tier:3, region:'peaks', effects:{frost:100,protection:82,toxicity:3}, properties:{density:2.3,solubility:.2,melting:75,boiling:275,conductivity:.95,heatCapacity:.3,cohesion:.95,acidity:7.1} },
  { id:'dragon-blood', name:'Dragon blood', subtitle:'Strength · fire', color:'#d75c64', icon:'♨', phase:'liquid', tier:3, region:'peaks', effects:{strength:100,warmth:94,energy:50,toxicity:48}, properties:{density:1.35,viscosity:.68,miscibility:'oil',solubility:.1,melting:8,boiling:155,flammability:.95,acidity:3.8,stability:.45} },
  { id:'cloud-milk', name:'Cloud milk', subtitle:'Gentle · volatile', color:'#e6d7f7', icon:'☁', phase:'liquid', tier:3, region:'peaks', effects:{healing:62,transformation:75,attraction:52,toxicity:2}, properties:{density:.68,viscosity:.2,melting:-25,boiling:54,volatility:.85,heatCapacity:.4,acidity:6.5} },
  { id:'phoenix-feather', name:'Phoenix feather', subtitle:'Renewal · warmth', color:'#fca46e', icon:'❧', phase:'solid', tier:3, region:'peaks', effects:{healing:100,warmth:80,energy:80,toxicity:5}, properties:{density:.42,solubility:.3,melting:110,boiling:310,flammability:.72,friction:.35} },
  { id:'void-ink', name:'Void ink', subtitle:'Transformation · unstable', color:'#9b7bcf', icon:'◈', phase:'liquid', tier:4, region:'ruins', effects:{transformation:100,energy:80,attraction:28,toxicity:42}, properties:{density:1.65,viscosity:.72,boiling:122,volatility:.34,acidity:3.2,stability:.18,electrical:.8} },
  { id:'star-crystal', name:'Star crystal', subtitle:'Energy · protection', color:'#e0ccec', icon:'✵', phase:'solid', tier:4, region:'ruins', effects:{energy:100,protection:100,toxicity:1}, properties:{density:2.7,solubility:.16,melting:145,boiling:460,conductivity:1,electrical:1,cohesion:.98} },
  { id:'mandrake', name:'Mandrake', subtitle:'Strength · transformation', color:'#caa978', icon:'♟', phase:'solid', tier:4, region:'ruins', effects:{strength:92,transformation:90,healing:35,toxicity:32}, properties:{density:1.4,solubility:.4,melting:70,boiling:200,acidity:4.5,cohesion:.8} },
  { id:'dawn-essence', name:'Dawn essence', subtitle:'Discovered reaction product', color:'#f7b184', icon:'☀', phase:'liquid', tier:5, region:'laboratory', effects:{strength:76,healing:85,warmth:44,protection:28,toxicity:2}, properties:{density:1.08,viscosity:.14,solubility:1,boiling:88,acidity:6.8,stability:.96} },
  { id:'aurora-binder', name:'Aurora binder', subtitle:'Discovered reaction product', color:'#9be3d8', icon:'✺', phase:'liquid', tier:5, region:'laboratory', effects:{frost:74,warmth:30,protection:92,energy:48,toxicity:3}, properties:{density:1.13,miscibility:'water',solubility:1,viscosity:.24,boiling:110,acidity:7.3,stability:.9} },
  { id:'pure-tincture', name:'Pure tincture', subtitle:'Discovered reaction product', color:'#d7a6eb', icon:'♧', phase:'liquid', tier:5, region:'laboratory', effects:{transformation:80,protection:66,energy:70,toxicity:5}, properties:{density:1.12,viscosity:.18,solubility:1,boiling:105,acidity:7,stability:.88} },
  { id:'storm-ether', name:'Storm ether', subtitle:'Discovered reaction product', color:'#d1c5ff', icon:'☇', phase:'gas', tier:5, region:'laboratory', effects:{energy:100,transformation:76,warmth:42,toxicity:8}, properties:{density:.12,viscosity:.02,solubility:.75,melting:-70,boiling:32,volatility:.96,flammability:.9,electrical:1,stability:.32} },
  { id:'winter-salve', name:'Winter salve', subtitle:'Discovered reaction product', color:'#bdd6d4', icon:'❋', phase:'paste', tier:5, region:'laboratory', effects:{healing:95,frost:55,protection:84,toxicity:0}, properties:{density:1.22,viscosity:.76,solubility:.75,melting:34,boiling:165,acidity:7.2,stability:.98} },
  { id:'heart-glow', name:'Heart glow', subtitle:'Discovered reaction product', color:'#edb4d5', icon:'♡', phase:'liquid', tier:5, region:'laboratory', effects:{attraction:100,healing:72,transformation:52,toxicity:0}, properties:{density:.9,viscosity:.13,solubility:1,boiling:69,volatility:.65,acidity:6.7,stability:.87} },
  { id:'ash', name:'Hearth ash', subtitle:'Combustion residue', color:'#85817e', icon:'·', phase:'powder', tier:5, region:'laboratory', effects:{protection:12,toxicity:22}, properties:{density:1.48,viscosity:.45,solubility:.12,melting:560,boiling:990,acidity:10.4,stability:.95} },
  { id:'smoke', name:'Alchemical smoke', subtitle:'Combustion vapor · toxic', color:'#9b94a2', icon:'☁', phase:'gas', tier:5, region:'laboratory', effects:{toxicity:94,warmth:24}, properties:{density:.08,viscosity:.01,solubility:.03,melting:-100,boiling:-30,volatility:1,acidity:4.2,stability:.82} },
  { id:'aegis-gel', name:'Aegis gel', subtitle:'Discovered reaction product', color:'#c9d3a4', icon:'⬡', phase:'paste', tier:5, region:'laboratory', effects:{protection:100,strength:66,energy:42,toxicity:0}, properties:{density:1.6,viscosity:.9,solubility:.6,melting:55,boiling:230,acidity:7.4,stability:.99} },
];

export function createWorld(seed: string): World {
  const random = seeded(seed.trim() || 'moonlit-market');
  const prefixes = ['Whispering','Amber','Velvet','Astral','Wild','Dusklit','Pale','Singing','Verdant','Royal','Wandering','Cinder'];
  const ingredients = materials.map((m): Ingredient => {
    const variation = .92 + random() * .16;
    const base: Ingredient = {
      id:m.id, name:m.tier > 1 && m.tier < 5 ? `${prefixes[Math.floor(random()*prefixes.length)]} ${m.name.toLowerCase()}` : m.name,
      subtitle:m.subtitle, description:'', color:m.color, icon:m.icon, phase:m.phase, tier:m.tier, region:m.region,
      density:1, viscosity:m.phase === 'liquid' ? .12 : .45, miscibility:'water', solubility:.5,
      conductivity:.4, heatCapacity:.7, melting:m.phase==='liquid'?-5:m.phase==='gas'?-60:60, boiling:190, volatility:.15, cohesion:.45,
      friction:.5, flammability:.05, acidity:7, stability:.8, electrical:.2,
      effects:effects(m.effects), price:m.tier * 3 + Math.floor(random()*3), ...m.properties,
    };
    if (m.id !== 'water') {
      base.density = +((base.density ?? 1) * variation).toFixed(3);
      base.boiling = +(base.boiling + (random()-.5)*12).toFixed(1);
      base.effects = effects(Object.fromEntries(EFFECTS.map(key => [key, +(base.effects[key]*variation).toFixed(1)])));
    }
    base.description = m.tier === 5 ? `${m.name} forms only through contact, temperature, and mixing. Discover its effects with experiments.` : `${m.subtitle}. ${base.miscibility === 'oil' ? 'Floats apart from water; stir to bring the layers into contact.' : base.phase === 'solid' ? 'Crush to expose more surface, then stir into a solvent.' : base.phase === 'powder' ? 'Fine grains settle and dissolve when brought into contact with water.' : base.phase === 'paste' ? 'A cohesive, slow-moving material that softens with heat.' : 'Flows freely and carries dissolved substances.'}`;
    return base;
  });
  const jitter = () => Math.round((random()-.5)*6);
  return { seed:seed.trim() || 'moonlit-market', ingredients, reactions:[
    {id:'dawn',name:'The dawn coupling',a:'emberroot',b:'moonleaf',product:'dawn-essence',minTemp:38+jitter(),maxTemp:98,mixing:.13,rate:.12,heat:4,clue:'A warm meeting between root and leaf may temper their sharpness.'},
    {id:'aurora',name:'Aurora emulsion',a:'frost-salt',b:'sun-oil',product:'aurora-binder',minTemp:18,maxTemp:62+jitter(),mixing:.25,rate:.1,heat:-6,clue:'Opposing seasons need persistent contact to find balance.'},
    {id:'purification',name:'Silver neutralization',a:'bog-venom',b:'silver-ash',product:'pure-tincture',minTemp:28+jitter(),maxTemp:94,mixing:.18,rate:.16,heat:8,clue:'The fen hides both a venom and a remedy for its acidity.'},
    {id:'storm',name:'Storm release',a:'spark-dust',b:'sun-oil',product:'storm-ether',minTemp:66+jitter(),maxTemp:160,mixing:.2,rate:.14,heat:22,clue:'Conductive dust and volatile oil can release a restless vapor.'},
    {id:'winter',name:'Winter binding',a:'glacier-pearl',b:'willow-resin',product:'winter-salve',minTemp:28,maxTemp:68+jitter(),mixing:.15,rate:.12,heat:-4,clue:'A crushed glacier held in softened resin keeps a soothing cold.'},
    {id:'heart',name:'Heartlight bloom',a:'rose-dew',b:'cloud-milk',product:'heart-glow',minTemp:20,maxTemp:48+jitter(),mixing:.2,rate:.1,heat:1,clue:'Delicate dew and cloud-milk favor gentle warmth.'},
    {id:'aegis',name:'Aegis weaving',a:'iron-moss',b:'star-crystal',product:'aegis-gel',minTemp:52+jitter(),maxTemp:145,mixing:.2,rate:.11,heat:5,clue:'Earthbound iron and powdered starlight can weave a lasting ward.'},
  ]};
}

export function getIngredient(world: World, id: string): Ingredient {
  const ingredient = world.ingredients.find(item => item.id === id);
  if (!ingredient) throw new Error(`Unknown ingredient: ${id}`);
  return ingredient;
}
