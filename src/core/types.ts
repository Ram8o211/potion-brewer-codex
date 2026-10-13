export const EFFECTS = ['strength', 'healing', 'warmth', 'frost', 'protection', 'transformation', 'attraction', 'energy', 'toxicity'] as const;
export type Effect = typeof EFFECTS[number];
export type Effects = Record<Effect, number>;
export type Phase = 'liquid' | 'powder' | 'solid' | 'gas' | 'paste';
export interface Ingredient {
  id: string; name: string; subtitle: string; description: string; color: string; icon: string; phase: Phase; tier: number; region: string;
  density: number; viscosity: number; miscibility: string; solubility: number; conductivity: number; heatCapacity: number;
  melting: number; boiling: number; volatility: number; cohesion: number; friction: number; flammability: number;
  acidity: number; stability: number; electrical: number; effects: Effects; price: number;
}
export interface Reaction { id: string; name: string; a: string; b: string; product: string; minTemp: number; maxTemp: number; mixing: number; rate: number; heat: number; clue: string; }
export interface World { seed: string; ingredients: Ingredient[]; reactions: Reaction[]; }
export interface Cell { composition: Record<string, number>; mass: number; phase: Phase; temperature: number; agitation: number; vx: number; vy: number; }
export interface PotionMetrics extends Effects { temperature: number; viscosity: number; acidity: number; volatility: number; density: number; homogeneity: number; mass: number; }
export interface Sample { composition: Record<string, number>; mass: number; metrics: PotionMetrics; signature: string; steps: string[]; }
export interface SimulationSnapshot { width: number; height: number; cells: (Cell | null)[]; heat: number; lid: boolean; elapsed: number; escaped: number; oxygen: number; events: string[]; ticks?: number; remainder?: number; lidTemperature?: number; heatEfficiency?: number; coolingEfficiency?: number; }
export interface Requirement { property: keyof PotionMetrics; min?: number; max?: number; target?: number; weight: number; label: string; }
export interface Commission { id: number; customer: string; role: string; portrait: string; dialogue: string; title: string; budget: number; requirements: Requirement[]; }
export interface Experiment { id: string; subject: string; name: string; signature: string; metrics: Partial<PotionMetrics>; observation: string; composition: Record<string, number>; steps: string[]; time: number; }
export interface Recipe { id: string; name: string; composition: Record<string, number>; steps: string[]; metrics: Partial<PotionMetrics>; signature: string; }
export interface Bottle { id: string; name: string; sample: Sample; }
export interface Settings { sound: boolean; volume: number; quality: 'auto' | 'low' | 'high'; reducedMotion: boolean; }
export interface GameState {
  version: number; seed: string; coins: number; reputation: number; day: number; sales: number; inventory: Record<string, number>;
  upgrades: string[]; journal: Experiment[]; recipes: Recipe[]; bottles: Bottle[]; commission: Commission; gathered: Record<string, number>;
  achievements: string[]; tutorial: number; settings: Settings; simulation: SimulationSnapshot | null; steps: string[]; mode: 'shop' | 'sandbox';
}
export interface Upgrade { id: string; name: string; description: string; price: number; reputation: number; }
export interface ExperimentSubject { id: string; name: string; icon: string; description: string; reveals: (keyof PotionMetrics)[]; }
