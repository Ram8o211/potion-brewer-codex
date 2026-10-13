import type { Cell, Ingredient, World } from '../core/types';
import type { Simulation } from '../core/simulation';

export interface LaboratoryOptions {
  tool?: 'stir' | 'crush' | 'inspect' | 'pour' | string;
  quality?: 'auto' | 'low' | 'high' | string;
  /** Pointer position in simulation grid coordinates. */
  pointer?: { x: number; y: number } | null;
  selectedColor?: string;
  reducedMotion?: boolean;
}

const W = 768;
const H = 672;
const GRID_X = 128;
const GRID_Y = 128;
const STEP = 8;
const TAU = Math.PI * 2;
type RGB = [number, number, number];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const random = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return v - Math.floor(v);
};

/** Original, resolution-independent illustration of the working alchemist's bench. */
export class LaboratoryRenderer {
  public sim: Simulation;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scenery: HTMLCanvasElement;
  private readonly liquid: HTMLCanvasElement;
  private readonly liquidCtx: CanvasRenderingContext2D;
  private readonly colors = new Map<string, RGB>();
  private ingredients = new Map<string, Ingredient>();
  private world: World;
  private dpr = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, sim: Simulation, world?: World) {
    this.canvas = canvas;
    this.sim = sim;
    this.world = world ?? sim.world;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The laboratory requires a Canvas 2D context.');
    this.ctx = ctx;
    this.scenery = document.createElement('canvas');
    this.scenery.width = W;
    this.scenery.height = H;
    this.liquid = document.createElement('canvas');
    this.liquid.width = 64;
    this.liquid.height = 56;
    this.liquidCtx = this.liquid.getContext('2d')!;
    this.refreshWorld();
    this.paintScenery(this.scenery.getContext('2d')!);
  }

  private refreshWorld() {
    this.world = this.sim.world;
    this.ingredients = new Map(this.world.ingredients.map((i) => [i.id, i]));
    this.colors.clear();
    for (const ingredient of this.world.ingredients) this.colors.set(ingredient.id, this.parseColor(ingredient.color));
  }

  toGrid(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - bounds.left) * W / Math.max(1, bounds.width) - GRID_X) / STEP,
      y: ((clientY - bounds.top) * H / Math.max(1, bounds.height) - GRID_Y) / STEP,
    };
  }

  inspector(x: number, y: number): Cell | null {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    return gx < 0 || gx >= this.sim.width || gy < 0 || gy >= this.sim.height
      ? null : this.sim.cells[gy * this.sim.width + gx] ?? null;
  }

  destroy() { this.destroyed = true; }

  render(time: number, options?: LaboratoryOptions): void;
  render(options?: LaboratoryOptions): void;
  render(timeOrOptions: number | LaboratoryOptions = performance.now(), suppliedOptions?: LaboratoryOptions): void {
    if (this.destroyed) return;
    const options = typeof timeOrOptions === 'number' ? suppliedOptions ?? {} : timeOrOptions;
    const time = options.reducedMotion ? 0 : (typeof timeOrOptions === 'number' ? timeOrOptions : performance.now()) * 0.001;
    if (this.world !== this.sim.world) this.refreshWorld();
    const dpr = Math.min(window.devicePixelRatio || 1, options.quality === 'low' ? 1 : 2);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.drawImage(this.scenery, 0, 0);
    this.paintLight(c, time, options);
    this.paintVesselBack(c);
    this.paintContents(c, time, options);
    this.paintVesselFront(c);
    this.paintFire(c, time, options.reducedMotion ?? false);
    if (this.sim.lid) this.paintLid(c);
    else if (options.pointer) this.paintTool(c, options.pointer, options.tool ?? 'stir', time, options.selectedColor);
    this.paintAtmosphere(c, time, options);
  }

  private parseColor(color: string): RGB {
    const h = color.replace('#', '');
    if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    return [151, 129, 177];
  }

  private cellColor(cell: Cell): RGB {
    let r = 0, g = 0, b = 0, total = 0;
    for (const [id, amount] of Object.entries(cell.composition)) {
      const rgb = this.colors.get(id) ?? [132, 109, 166];
      r += rgb[0] * amount; g += rgb[1] * amount; b += rgb[2] * amount; total += amount;
    }
    return total > 0 ? [Math.round(r / total), Math.round(g / total), Math.round(b / total)] : [98, 78, 126];
  }

  private rgb(rgb: RGB, alpha = 1, light = 0): string {
    return `rgba(${clamp(Math.round(rgb[0] + light), 0, 255)},${clamp(Math.round(rgb[1] + light), 0, 255)},${clamp(Math.round(rgb[2] + light), 0, 255)},${alpha})`;
  }

  private ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string, width = 1) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  private path(c: CanvasRenderingContext2D, path: string, fill?: string | CanvasGradient, stroke?: string, width = 1) {
    const p = new Path2D(path);
    if (fill) { c.fillStyle = fill; c.fill(p); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(p); }
  }

  private paintScenery(c: CanvasRenderingContext2D) {
    const wall = c.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#182b29'); wall.addColorStop(0.42, '#2b3b32'); wall.addColorStop(1, '#3b3227');
    c.fillStyle = wall; c.fillRect(0, 0, W, H);

    // The tall leaded window looks onto the same quiet forest as the gathering map.
    this.path(c, 'M267 228 L267 118 Q267 12 384 12 Q501 12 501 118 L501 228 Q385 251 267 228 Z', '#101f20');
    const sky = c.createLinearGradient(0, 0, 0, 228);
    sky.addColorStop(0, '#274843'); sky.addColorStop(0.62, '#729082'); sky.addColorStop(1, '#36584a');
    const windowShape = new Path2D('M280 217 L280 118 Q280 25 384 25 Q488 25 488 118 L488 217 Q384 235 280 217 Z');
    c.fillStyle = sky; c.fill(windowShape);
    c.save(); c.clip(windowShape);
    this.ellipse(c, 421, 67, 29, 29, '#d4ddaa');
    this.ellipse(c, 412, 59, 28, 29, '#749286');
    const moonHalo = c.createRadialGradient(421, 65, 22, 421, 65, 93);
    moonHalo.addColorStop(0, '#c6dfab28'); moonHalo.addColorStop(1, '#c6dfab00');
    c.fillStyle = moonHalo; c.fillRect(280, 0, 208, 180);
    this.path(c, 'M280 164 L312 126 L338 158 L381 121 L421 160 L460 130 L488 166 L488 230 L280 230 Z', '#43675b');
    this.path(c, 'M280 189 Q326 150 359 180 Q403 137 488 190 L488 230 L280 230 Z', '#284f45');
    for (let i = 0; i < 13; i++) {
      const x = 278 + i * 18, height = 34 + random(i + 65) * 55, base = 222;
      this.tree(c, x, base, height, i % 2 ? '#1e443a' : '#2b5748');
    }
    // A small hand-painted constellation, a restrained focal point above the vessel.
    c.fillStyle = '#dfdcb980';
    for (const [x, y] of [[313, 49], [346, 29], [350, 75], [469, 40], [313, 104], [451, 109]]) {
      this.ellipse(c, x, y, 1.3, 1.3, '#dcdac8b0');
    }
    c.strokeStyle = '#263c32'; c.lineWidth = 8;
    c.beginPath(); c.moveTo(384, 0); c.lineTo(384, 223); c.moveTo(279, 112); c.lineTo(489, 112); c.stroke();
    c.strokeStyle = '#b29d6350'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(387, 0); c.lineTo(387, 223); c.moveTo(279, 115); c.lineTo(489, 115); c.stroke();
    c.restore();
    this.path(c, 'M271 226 L271 118 Q271 16 384 16 Q498 16 498 118 L498 226 Q384 249 271 226 Z M280 217 Q384 240 488 217 L488 118 Q488 25 384 25 Q280 25 280 118 Z', '#5f6650', '#162a25', 3);
    this.path(c, 'M276 117 Q276 21 384 21 Q493 21 493 117', undefined, '#c0b17740', 1);
    this.path(c, 'M265 227 Q384 253 503 227 L505 239 Q384 265 263 239 Z', '#69715a', '#23342b', 3);

    // Curved timbers make the scene feel carved and settled rather than geometric.
    this.path(c, 'M213 0 Q168 114 204 307 L231 310 Q203 145 235 0 Z', '#493f2a', '#18261f', 3);
    this.path(c, 'M538 0 Q581 137 550 308 L576 311 Q611 138 560 0 Z', '#493f2a', '#18261f', 3);
    this.path(c, 'M226 0 Q191 128 218 284', undefined, '#96875b35', 3);
    this.path(c, 'M550 0 Q589 122 562 286', undefined, '#96875b35', 3);
    this.path(c, 'M0 76 Q97 20 200 51', undefined, '#a8aa7830', 2);
    this.path(c, 'M570 48 Q673 16 768 67', undefined, '#a8aa7830', 2);
    for (let i = 0; i < 460; i++) {
      const x = random(i + 92) * W, y = random(i + 213) * 545;
      if (x > 257 && x < 510 && y < 252) continue;
      c.fillStyle = i % 2 ? '#c1c19408' : '#050d140f';
      c.fillRect(x, y, 1 + random(i) * 4, 1 + random(i + 1) * 3);
    }

    // The two shelves hold original glassware, waxed labels, and small old books.
    this.shelf(c, 19, 167, 184);
    this.shelf(c, 568, 159, 180);
    this.bottle(c, 50, 161, 20, 58, '#819367', 'round');
    this.bottle(c, 92, 161, 15, 74, '#ab8c65', 'tall');
    this.bottle(c, 134, 161, 20, 50, '#9c7197', 'round');
    this.bottle(c, 180, 161, 12, 65, '#497b72', 'tall');
    this.bottle(c, 599, 153, 19, 62, '#967349', 'round');
    this.bottle(c, 642, 153, 16, 78, '#6c9274', 'tall');
    this.bottle(c, 694, 153, 24, 47, '#a388a5', 'round');
    this.shelf(c, 15, 278, 147);
    this.shelf(c, 607, 274, 149);
    this.books(c, 54, 269);
    this.bottle(c, 128, 269, 15, 47, '#b8a56b', 'round');
    this.bottle(c, 647, 265, 23, 64, '#65949a', 'round');
    this.bottle(c, 698, 265, 18, 48, '#bb9478', 'tall');

    // Hanging sage and rosemary, attached to a real beam above the shelf.
    this.herbs(c, 233, 0, 101);
    this.herbs(c, 547, 0, 66);
    this.path(c, 'M8 319 Q71 303 131 319', undefined, '#6f745140', 2);
    this.candle(c, 76, 386, 64);
    this.candle(c, 695, 382, 76);
    this.path(c, 'M35 414 L98 402 L126 438 L72 454 Z', '#534b31', '#252d22', 2);
    this.path(c, 'M37 416 Q72 415 72 447 Q80 415 98 406 L125 437 Q92 425 72 450 Q64 430 37 416 Z', '#a29868');
    this.path(c, 'M44 421 Q61 423 66 431 M46 427 L64 434 M83 426 L103 419 M85 432 L110 425', undefined, '#665c3c', 1);
    this.path(c, 'M651 423 Q677 407 733 428 L734 446 L660 443 Z', '#716446', '#242d22', 2);
    this.path(c, 'M667 424 L720 433 M675 419 L724 427', undefined, '#b6a06a65', 2);

    // Long green-gold workbench and an understated painted alchemy circle.
    const bench = c.createLinearGradient(0, 462, 0, H);
    bench.addColorStop(0, '#646144'); bench.addColorStop(0.16, '#4c4e35'); bench.addColorStop(0.63, '#353d2d'); bench.addColorStop(1, '#202c25');
    this.path(c, 'M0 469 Q386 445 768 469 L768 672 L0 672 Z', bench);
    this.path(c, 'M0 469 Q386 445 768 469', undefined, '#ada57a45', 2);
    for (let i = 0; i < 7; i++) this.path(c, `M0 ${485 + i * 29} Q${290 + i * 30} ${464 + i * 31} 768 ${486 + i * 31}`, undefined, '#18251f30', 1);
    for (let i = 0; i < 70; i++) {
      const x = random(i + 177) * W, y = 477 + random(i + 498) * 190;
      this.path(c, `M${x} ${y} Q${x + 11} ${y - 2} ${x + 32 + random(i) * 25} ${y + 1}`, undefined, '#b5aa6920', 1);
    }
    this.ellipse(c, 384, 598, 245, 56, '#35442d00', '#b5a77830', 1);
    this.ellipse(c, 384, 598, 222, 49, '#35442d00', '#b5a77820', 1);
    c.save(); c.translate(384, 598); c.scale(1, 0.225);
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 4 / 5;
      const x = Math.cos(angle) * 216, y = Math.sin(angle) * 216;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.strokeStyle = '#b5a77820'; c.lineWidth = 1; c.stroke(); c.restore();
    this.ellipse(c, 384, 608, 195, 40, '#0b181d50');
    // The foreground corners contain a mortar, a folded cloth, and grounded herbs.
    this.mortar(c, 94, 556);
    this.path(c, 'M622 522 Q662 517 710 536 L697 590 Q656 568 608 580 Z', '#777561', '#2d3c2c', 2);
    this.path(c, 'M628 532 Q665 527 701 544 M622 548 Q660 541 696 560 M615 565 Q659 553 692 575', undefined, '#b3ad8b30', 1);
    this.path(c, 'M640 553 Q654 521 680 500 M648 536 Q637 524 631 518 M658 520 Q669 520 679 522', undefined, '#879868', 2);
    for (let i = 0; i < 8; i++) this.leaf(c, 645 + i * 3.8, 542 - i * 5.4, 11, -1 + i * 0.1, '#799064', '#b2ad702e');
    this.ellipse(c, 617, 609, 20, 6, '#10231e35');
    this.path(c, 'M600 592 Q617 581 634 592 Q635 609 617 611 Q600 608 600 592 Z', '#806b44', '#273126', 2);
    this.ellipse(c, 617, 592, 17, 5, '#b5a06a', '#4b492f', 1);
    this.ellipse(c, 617, 592, 11, 3, '#4d6650');

    const vignette = c.createRadialGradient(384, 322, 180, 384, 322, 500);
    vignette.addColorStop(0, '#06121500'); vignette.addColorStop(1, '#0612156b');
    c.fillStyle = vignette; c.fillRect(0, 0, W, H);
  }

  private tree(c: CanvasRenderingContext2D, x: number, base: number, height: number, color: string) {
    this.path(c, `M${x} ${base - height} L${x - height * 0.16} ${base - height * 0.46} L${x - height * 0.1} ${base - height * 0.46} L${x - height * 0.24} ${base - height * 0.16} L${x - 3} ${base - height * 0.16} L${x - 3} ${base} L${x + 3} ${base} L${x + 3} ${base - height * 0.16} L${x + height * 0.24} ${base - height * 0.16} L${x + height * 0.1} ${base - height * 0.46} L${x + height * 0.16} ${base - height * 0.46} Z`, color);
  }

  private shelf(c: CanvasRenderingContext2D, x: number, y: number, width: number) {
    this.path(c, `M${x} ${y} L${x + width} ${y} L${x + width + 5} ${y + 9} L${x - 3} ${y + 9} Z`, '#7e6b46', '#172720', 2);
    this.path(c, `M${x - 3} ${y + 9} L${x + width + 5} ${y + 9} L${x + width + 5} ${y + 17} L${x - 3} ${y + 17} Z`, '#4d4630');
    this.path(c, `M${x + 20} ${y + 18} L${x + 20} ${y + 37} Q${x + 38} ${y + 26} ${x + 38} ${y + 18} M${x + width - 30} ${y + 18} L${x + width - 30} ${y + 35} Q${x + width - 12} ${y + 25} ${x + width - 12} ${y + 18}`, undefined, '#5c6040', 6);
    this.path(c, `M${x + 1} ${y + 2} L${x + width - 2} ${y + 2}`, undefined, '#c3ac654d', 1);
  }

  private bottle(c: CanvasRenderingContext2D, x: number, base: number, half: number, height: number, color: string, shape: 'round' | 'tall') {
    const neck = base - height, shoulder = neck + 22;
    c.save();
    const glass = c.createLinearGradient(x - half, 0, x + half, 0);
    glass.addColorStop(0, '#61796c88'); glass.addColorStop(0.24, '#a5bb8970'); glass.addColorStop(0.53, '#8da69030'); glass.addColorStop(1, '#26483e99');
    const p = shape === 'round'
      ? `M${x - 7} ${neck} L${x + 7} ${neck} L${x + 7} ${shoulder - 8} Q${x + half + 7} ${shoulder} ${x + half} ${base - 9} Q${x + half - 3} ${base} ${x} ${base} Q${x - half + 3} ${base} ${x - half} ${base - 9} Q${x - half - 7} ${shoulder} ${x - 7} ${shoulder - 8} Z`
      : `M${x - 6} ${neck} L${x + 6} ${neck} L${x + 6} ${shoulder - 4} L${x + half} ${shoulder + 3} L${x + half} ${base - 4} Q${x} ${base + 3} ${x - half} ${base - 4} L${x - half} ${shoulder + 3} L${x - 6} ${shoulder - 4} Z`;
    this.path(c, p, glass, '#182f2799', 2);
    c.clip(new Path2D(p));
    c.globalAlpha = 0.65; c.fillStyle = color;
    c.fillRect(x - half - 3, base - height * 0.48, half * 2 + 6, height);
    this.ellipse(c, x, base - height * 0.48, half, 3, color);
    c.globalAlpha = 1;
    this.path(c, `M${x - half + 5} ${shoulder + 4} L${x - half + 5} ${base - 11}`, undefined, '#d1e3b56b', 2);
    c.restore();
    this.path(c, `M${x - 8} ${neck - 4} L${x + 8} ${neck - 4} L${x + 7} ${neck + 3} L${x - 7} ${neck + 3} Z`, '#827054', '#23382c', 1);
    this.path(c, `M${x - 10} ${base - 25} Q${x} ${base - 28} ${x + 11} ${base - 25} L${x + 9} ${base - 12} Q${x} ${base - 9} ${x - 9} ${base - 12} Z`, '#d0be8aa6', '#6a75533d', 1);
    c.save(); c.translate(x, base - 19); c.rotate(Math.PI / 4);
    c.strokeStyle = '#575c4080'; c.lineWidth = 1; c.strokeRect(-2.5, -2.5, 5, 5); c.restore();
  }

  private books(c: CanvasRenderingContext2D, x: number, base: number) {
    const colors = ['#6c7857', '#826c4e', '#515c54', '#967859'];
    for (let i = 0; i < 4; i++) {
      const width = 12 + i * 2, height = 48 - i * 5;
      this.path(c, `M${x} ${base} L${x - 4} ${base - height} L${x + width - 4} ${base - height} L${x + width} ${base} Z`, colors[i], '#243426', 2);
      this.path(c, `M${x - 1} ${base - height + 7} L${x + width - 3} ${base - height + 7} M${x + 1} ${base - 10} L${x + width - 1} ${base - 10}`, undefined, '#c0af7760', 2);
      x += width + 1;
    }
  }

  private leaf(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, color: string, vein = '#a6b17c60') {
    c.save(); c.translate(x, y); c.rotate(angle);
    this.path(c, `M0 0 Q${-size * 0.57} ${-size * 0.75} 0 ${-size} Q${size * 0.53} ${-size * 0.72} 0 0 Z`, color);
    this.path(c, `M0 0 L0 ${-size * 0.8}`, undefined, vein, 0.8);
    c.restore();
  }

  private herbs(c: CanvasRenderingContext2D, x: number, y: number, length: number) {
    this.path(c, `M${x} ${y} L${x - 3} ${y + length}`, undefined, '#b29e6a', 1);
    this.path(c, `M${x - 4} ${y + length - 18} Q${x - 18} ${y + length + 8} ${x - 21} ${y + length + 47} M${x - 2} ${y + length - 18} Q${x + 2} ${y + length + 17} ${x + 9} ${y + length + 57} M${x + 1} ${y + length - 18} Q${x + 22} ${y + length + 9} ${x + 24} ${y + length + 42}`, undefined, '#79845a', 2);
    for (let i = 0; i < 26; i++) {
      const branch = i % 3, depth = Math.floor(i / 3);
      const dx = branch === 0 ? -depth * 2.7 : branch === 1 ? depth * 1.3 : depth * 3.1;
      this.leaf(c, x + dx, y + length - 8 + depth * 6, 12 + random(i + x) * 7, (i % 2 ? 1 : -1) * 0.8, i % 3 ? '#657e58' : '#91a073');
    }
    this.path(c, `M${x - 8} ${y + length - 15} L${x + 5} ${y + length - 16} M${x - 8} ${y + length - 12} L${x + 5} ${y + length - 13}`, undefined, '#c7af79', 2);
  }

  private candle(c: CanvasRenderingContext2D, x: number, base: number, height: number) {
    this.ellipse(c, x, base + 6, 25, 8, '#796541', '#29382b', 2);
    this.path(c, `M${x - 14} ${base + 3} Q${x} ${base - 5} ${x + 14} ${base + 3} L${x + 10} ${base - 8} L${x - 10} ${base - 8} Z`, '#9b8952', '#38412b', 1);
    const wax = c.createLinearGradient(x - 10, 0, x + 10, 0);
    wax.addColorStop(0, '#b9b280'); wax.addColorStop(0.5, '#d1c898'); wax.addColorStop(1, '#989967');
    this.path(c, `M${x - 8} ${base - height} Q${x} ${base - height - 4} ${x + 8} ${base - height} L${x + 8} ${base - 8} Q${x} ${base - 5} ${x - 8} ${base - 8} Z`, wax, '#5b6845', 1);
    this.path(c, `M${x - 7} ${base - height + 2} Q${x - 3} ${base - height + 25} ${x - 1} ${base - height + 4} Q${x + 4} ${base - height + 17} ${x + 7} ${base - height + 2}`, undefined, '#e0d7a7', 3);
    this.path(c, `M${x} ${base - height} L${x + 1} ${base - height - 5}`, undefined, '#3e4730', 1);
    this.path(c, `M${x} ${base - height - 5} Q${x - 11} ${base - height - 15} ${x + 2} ${base - height - 28} Q${x + 11} ${base - height - 14} ${x} ${base - height - 5} Z`, '#e4c681');
    this.path(c, `M${x} ${base - height - 6} Q${x - 4} ${base - height - 14} ${x + 1} ${base - height - 18} Q${x + 5} ${base - height - 11} ${x} ${base - height - 6} Z`, '#f5e2a0');
  }

  private mortar(c: CanvasRenderingContext2D, x: number, y: number) {
    this.ellipse(c, x + 3, y + 33, 55, 14, '#142d213b');
    this.path(c, `M${x - 44} ${y - 2} L${x + 42} ${y - 2} Q${x + 33} ${y + 33} ${x} ${y + 37} Q${x - 32} ${y + 30} ${x - 44} ${y - 2} Z`, '#78806a', '#273a2b', 3);
    this.path(c, `M${x - 28} ${y + 6} Q${x - 22} ${y + 22} ${x - 4} ${y + 27}`, undefined, '#a9ac8580', 2);
    this.ellipse(c, x, y - 2, 44, 13, '#a1a389', '#40513a', 2);
    this.ellipse(c, x, y - 2, 35, 9, '#3c5140');
    this.path(c, `M${x - 6} ${y - 3} L${x + 30} ${y - 59} Q${x + 37} ${y - 64} ${x + 43} ${y - 57} L${x + 10} ${y + 2} Z`, '#88977c', '#334d38', 2);
    this.path(c, `M${x + 4} ${y - 6} L${x + 38} ${y - 57}`, undefined, '#bdc4a287', 2);
    for (let i = 0; i < 12; i++) this.ellipse(c, x - 25 + random(i + 139) * 49, y - 4 + random(i + 151) * 7, 2, 1, '#9d9b65');
  }

  private paintLight(c: CanvasRenderingContext2D, time: number, options: LaboratoryOptions) {
    const shimmer = options.reducedMotion ? 1 : 0.92 + Math.sin(time * 1.6) * 0.04 + Math.sin(time * 3.1) * 0.04;
    for (const [x, y] of [[76, 297], [695, 281]]) {
      const glow = c.createRadialGradient(x, y, 0, x, y, 108);
      glow.addColorStop(0, `rgba(247,192,99,${0.15 * shimmer})`);
      glow.addColorStop(0.28, `rgba(239,173,83,${0.065 * shimmer})`);
      glow.addColorStop(1, '#f5ca8800');
      c.fillStyle = glow; c.fillRect(x - 108, y - 108, 216, 216);
    }
    this.path(c, 'M319 115 L397 115 L642 468 L221 475 Z', '#c9dca206');
  }

  private bowlPath(c: CanvasRenderingContext2D) {
    c.beginPath();
    c.moveTo(176, 224); c.lineTo(600, 224);
    // This quadratic follows isInside's squared inset, with a rounded floor beneath row 54.
    c.quadraticCurveTo(600, 396, 472, 568);
    c.quadraticCurveTo(388, 591, 304, 568);
    c.quadraticCurveTo(176, 396, 176, 224); c.closePath();
  }

  private paintVesselBack(c: CanvasRenderingContext2D) {
    this.ellipse(c, 384, 603, 181, 28, '#09171770');
    // Rear handles: brass, blackened at the joins, with an unbroken physical silhouette.
    for (const side of [-1, 1]) {
      c.save(); c.translate(384, 0); c.scale(side, 1);
      this.path(c, 'M-209 295 C-267 263 -282 293 -267 329 C-257 352 -229 359 -207 344', undefined, '#102e28', 24);
      this.path(c, 'M-209 295 C-267 263 -282 293 -267 329 C-257 352 -229 359 -207 344', undefined, '#8d7c4f', 15);
      this.path(c, 'M-212 291 C-267 267 -275 295 -264 322', undefined, '#d4b77a85', 3);
      this.ellipse(c, -217, 304, 12, 17, '#405a48', '#bca36d', 3);
      this.ellipse(c, -216, 302, 3, 3, '#d5be83'); c.restore();
    }
    // A cutaway retains the cauldron's substantial metal walls while exposing the mixture.
    const metal = c.createLinearGradient(145, 0, 620, 0);
    metal.addColorStop(0, '#728d69'); metal.addColorStop(0.09, '#a2a172'); metal.addColorStop(0.16, '#596a48');
    metal.addColorStop(0.45, '#294b3c'); metal.addColorStop(0.7, '#294738'); metal.addColorStop(0.91, '#738268'); metal.addColorStop(1, '#253f32');
    this.path(c, 'M151 224 Q153 397 228 521 Q269 590 384 597 Q499 590 540 521 Q615 397 617 224 Z', metal, '#112d25', 5);
    this.path(c, 'M167 255 Q173 402 239 510 Q260 545 294 562', undefined, '#c8bb7848', 3);
    this.path(c, 'M605 251 Q601 398 539 507 Q520 540 489 558', undefined, '#a4b88738', 2);
    c.save(); this.bowlPath(c); c.clip();
    const inside = c.createLinearGradient(0, 218, 0, 579);
    inside.addColorStop(0, '#1f342e'); inside.addColorStop(0.24, '#1e332d'); inside.addColorStop(0.63, '#162c26'); inside.addColorStop(1, '#10261f');
    c.fillStyle = inside; c.fillRect(160, 214, 445, 380);
    const light = c.createRadialGradient(308, 275, 1, 355, 331, 220);
    light.addColorStop(0, '#93ad791e'); light.addColorStop(1, '#a3b97600');
    c.fillStyle = light; c.fillRect(160, 214, 445, 380);
    for (let i = 0; i < 20; i++) {
      const x = 179 + random(i + 489) * 410, y = 252 + random(i + 594) * 320;
      this.path(c, `M${x} ${y} L${x + 1} ${y + 11 + random(i) * 16}`, undefined, '#c0c99808', 1);
    }
    this.ellipse(c, 384, 559, 71, 10, '#7d915e08', '#7b906117', 1);
    this.ellipse(c, 384, 559, 26, 4, '#193027', '#7b906117', 1);
    c.restore();
    // The rear rim sits above the fluid. Its front half is painted after the contents.
    const rim = c.createLinearGradient(0, 210, 0, 252);
    rim.addColorStop(0, '#c1b47b'); rim.addColorStop(0.3, '#8c986a'); rim.addColorStop(0.6, '#5c7350'); rim.addColorStop(1, '#263f32');
    this.ellipse(c, 384, 226, 233, 26, rim, '#233d2e', 3);
    this.ellipse(c, 384, 230, 212, 18, '#1f352d', '#d2be8138', 1);
    this.path(c, 'M180 222 Q384 190 588 222', undefined, '#d9c88b80', 2);
    // Tiny permanent engraving on the rear lip, not a simulated event.
    this.path(c, 'M371 209 L377 204 L382 209 M387 209 L392 204 L397 209', undefined, '#e4d49c80', 1);
  }

  private simulationClip(c: CanvasRenderingContext2D) {
    // Parcels already occupy only legal cells. A smooth wall clips the interpolation fringe.
    this.bowlPath(c);
    c.clip();
  }

  private paintContents(c: CanvasRenderingContext2D, time: number, options: LaboratoryOptions) {
    const cells = this.sim.cells, width = this.sim.width, height = this.sim.height;
    const pixels = this.liquidCtx.createImageData(width, height);
    let liquidCount = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell || cell.mass < 0.004 || (cell.phase !== 'liquid' && cell.phase !== 'paste' && cell.phase !== 'solid')) continue;
      const rgb = this.cellColor(cell);
      const depth = Math.floor(i / width) / height;
      const shade = cell.phase === 'paste' ? -20 : cell.phase === 'solid' ? 21 : 9 - depth * 22;
      const p = i * 4;
      pixels.data[p] = clamp(rgb[0] + shade, 0, 255);
      pixels.data[p + 1] = clamp(rgb[1] + shade, 0, 255);
      pixels.data[p + 2] = clamp(rgb[2] + shade, 0, 255);
      pixels.data[p + 3] = (cell.phase === 'solid' ? 230 : 255) * Math.sqrt(clamp(cell.mass / 1.2, 0, 1));
      liquidCount++;
    }
    this.liquidCtx.putImageData(pixels, 0, 0);
    c.save(); this.simulationClip(c);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.liquid, GRID_X, GRID_Y, width * STEP, height * STEP);
    if (liquidCount) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = y * width + x, cell = cells[index];
        if (!cell || cell.mass < 0.04) continue;
        const px = GRID_X + x * STEP, py = GRID_Y + y * STEP;
        const rgb = this.cellColor(cell);
        if (cell.phase === 'liquid') {
          const above = y > 0 ? cells[index - width] : null;
          if (cell.mass > 0.15 && (!above || above.mass < 0.04 || (above.phase !== 'liquid' && above.phase !== 'paste'))) {
            const wave = options.reducedMotion ? 0 : Math.sin(x * 0.46 + time * 2.2) * cell.agitation * 1.9;
            const nextWave = options.reducedMotion ? 0 : Math.sin((x + 1) * 0.46 + time * 2.2) * cell.agitation * 1.9;
            c.beginPath(); c.moveTo(px - 0.5, py + 1.5 + wave); c.lineTo(px + STEP + 0.5, py + 1.5 + nextWave);
            c.strokeStyle = this.rgb(rgb, 0.42, 67); c.lineWidth = 1.2; c.stroke();
            if (cell.agitation > 0.32 && (x + y) % 5 === 0) this.ellipse(c, px + 4, py + 4, 2.5, 0.65, this.rgb(rgb, 0.34, 80));
          }
          let boiling = 0, sum = 0;
          for (const [id, amount] of Object.entries(cell.composition)) { boiling += (this.ingredients.get(id)?.boiling ?? 100) * amount; sum += amount; }
          boiling = sum ? boiling / sum : 100;
          if (cell.temperature > boiling - 7 && random(index + 70) > 0.91 && options.quality !== 'low') {
            const cycle = (time * (0.35 + random(index) * 0.4) + random(index + 39)) % 1;
            const radius = 1.1 + cycle * 2.4;
            const by = py + 7 - cycle * 18;
            this.ellipse(c, px + 4, by, radius, radius * 0.78, this.rgb(rgb, 0.05, 85), this.rgb(rgb, 0.48, 88), 0.8);
            this.ellipse(c, px + 3.5, by - radius * 0.3, 0.7, 0.5, '#f8ecdb6b');
          }
        } else if (cell.phase === 'solid') {
          const left = cells[index - 1], up = y > 0 ? cells[index - width] : null;
          if (left?.phase !== 'solid' || up?.phase !== 'solid') {
            this.path(c, `M${px + 1} ${py + 7} L${px + 1} ${py + 1} L${px + 7} ${py + 1}`, undefined, this.rgb(rgb, 0.7, 64), 1.1);
          }
          if (random(index + 101) > 0.88) this.path(c, `M${px + 1} ${py + 2} L${px + 4} ${py + 5} L${px + 7} ${py + 3}`, undefined, this.rgb(rgb, 0.45, 63), 0.7);
        } else if (cell.phase === 'paste') {
          if ((x + y) % 3 === 0) this.ellipse(c, px + 4, py + 4, 4.5, 3, this.rgb(rgb, 0.18, 9));
          if (random(index) > 0.93) this.path(c, `M${px + 2} ${py + 4} Q${px + 4} ${py + 1} ${px + 7} ${py + 3}`, undefined, this.rgb(rgb, 0.3, 43), 1);
        }
      }
    }
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell || cell.mass < 0.004) continue;
      const x = GRID_X + i % width * STEP, y = GRID_Y + Math.floor(i / width) * STEP;
      const rgb = this.cellColor(cell);
      if (cell.phase === 'powder') {
        c.fillStyle = this.rgb(rgb, 0.38 * Math.sqrt(clamp(cell.mass / 1.2, 0, 1)), -12);
        c.fillRect(x, y, STEP, STEP);
        const grainCount = Math.max(1, Math.ceil(cell.mass * 14));
        for (let grain = 0; grain < grainCount; grain++) {
          const key = i * 11 + grain;
          const gx = x + random(key + 911) * STEP, gy = y + random(key + 172) * STEP;
          const size = 0.6 + random(key + 8) * 1.4;
          c.save(); c.translate(gx, gy); c.rotate(random(key) * Math.PI);
          c.fillStyle = this.rgb(rgb, clamp(cell.mass * 3, 0.08, 0.84), grain % 3 === 0 ? 43 : -8);
          c.fillRect(-size / 2, -size / 2, size * 1.5, size); c.restore();
        }
      } else if (cell.phase === 'gas') {
        const radius = 6 + cell.mass * 4;
        const cloud = c.createRadialGradient(x + 4, y + 4, 0, x + 4, y + 4, radius);
        cloud.addColorStop(0, this.rgb(rgb, clamp(cell.mass * 0.28, 0.04, 0.4), 66));
        cloud.addColorStop(1, this.rgb(rgb, 0, 45));
        c.fillStyle = cloud; c.fillRect(x + 4 - radius, y + 4 - radius, radius * 2, radius * 2);
      }
    }
    c.restore();
  }

  private paintVesselFront(c: CanvasRenderingContext2D) {
    // Front rim, wall edge and feet keep the cutaway immediately readable as a cauldron.
    this.path(c, 'M152 228 Q173 246 188 247 Q384 271 579 247 Q602 244 616 228 L613 246 Q603 256 582 262 Q384 286 185 262 Q166 256 155 246 Z', '#627954', '#1d3d2e', 2);
    this.path(c, 'M154 232 Q179 252 209 254 Q384 273 559 254 Q595 250 614 232', undefined, '#ccb97a97', 3);
    this.path(c, 'M177 262 Q197 428 269 533 Q302 578 384 581 Q466 578 499 533 Q571 428 591 262', undefined, '#102c22', 5);
    this.path(c, 'M172 264 Q195 424 267 532', undefined, '#a2a56c60', 2);
    this.path(c, 'M596 264 Q573 424 501 532', undefined, '#c5bd8655', 2);
    this.path(c, 'M277 552 Q304 590 384 591 Q464 590 491 552', undefined, '#82966a', 4);
    this.path(c, 'M280 557 Q306 591 384 593 Q462 591 488 557', undefined, '#b8ae7470', 1);
    for (const side of [-1, 1]) {
      c.save(); c.translate(384, 0); c.scale(side, 1);
      const foot = c.createLinearGradient(-116, 0, -68, 0);
      foot.addColorStop(0, '#546c48'); foot.addColorStop(0.55, '#9d9c69'); foot.addColorStop(1, '#293f2f');
      this.path(c, 'M-90 570 Q-86 604 -114 630 L-109 641 Q-73 642 -65 632 Q-79 607 -62 582 Z', foot, '#173727', 3);
      this.path(c, 'M-86 589 Q-93 617 -101 632 L-79 634', undefined, '#d0bc7a58', 2);
      c.restore();
    }
    // Brass maker's mark and four inlaid runes are small enough to reward a closer look.
    for (let i = 0; i < 5; i++) {
      c.save(); c.translate(332 + i * 26, 584 + Math.sin(i * Math.PI / 4) * 4);
      const rune = i % 3;
      if (rune === 0) this.path(c, 'M-4 0 L0 -5 L4 0 L0 4 Z M0 -5 L0 4', undefined, '#c8b57a80', 1);
      else if (rune === 1) this.path(c, 'M-4 4 L-4 -4 L4 -4 L0 0 L4 4', undefined, '#c8b57a80', 1);
      else this.path(c, 'M-4 -4 L4 4 M4 -4 L-4 4 M0 -4 L0 4', undefined, '#c8b57a80', 1);
      c.restore();
    }
  }

  private paintFire(c: CanvasRenderingContext2D, time: number, reducedMotion: boolean) {
    const heat = this.sim.heat;
    this.ellipse(c, 384, 644, 44, 10, '#12291f77');
    this.path(c, 'M351 636 Q384 630 417 636 L423 649 Q385 663 345 650 Z', '#4c583b', '#1b3326', 2);
    this.ellipse(c, 384, 636, 34, 7, '#a2945a', '#213c2b', 2);
    this.ellipse(c, 384, 636, 26, 5, '#233327');
    this.path(c, 'M371 647 L397 647', undefined, '#bca77185', 2);
    this.ellipse(c, 384, 649, 3, 3, '#9e8b52', '#d3bd7d66', 1);
    if (Math.abs(heat) < 0.01) return;
    const strength = Math.abs(heat);
    const cool = heat < 0;
    const glow = c.createRadialGradient(384, 610, 5, 384, 610, 103 + strength * 32);
    glow.addColorStop(0, cool ? '#99d8df35' : '#f9bb5658');
    glow.addColorStop(0.5, cool ? '#8ebed415' : '#d8924222'); glow.addColorStop(1, '#ffa44000');
    c.fillStyle = glow; c.fillRect(242, 465, 284, 207);
    for (let i = 0; i < 7; i++) {
      const x = 362 + i * 7;
      const wave = reducedMotion ? 0 : Math.sin(time * 6 + i * 1.53) * 5;
      const height = 14 + strength * (22 + Math.sin(i * 1.9) * 10) + wave;
      this.path(c, `M${x - 7} 634 Q${x - 12} ${630 - height * 0.5} ${x + wave * 0.6} ${634 - height} Q${x + 3} ${623 - height * 0.35} ${x + 7} 634 Z`, cool ? '#8fced0a6' : '#e8a04bbd');
      this.path(c, `M${x - 4} 634 Q${x - 6} ${634 - height * 0.4} ${x + 1} ${634 - height * 0.6} Q${x + 2} ${634 - height * 0.25} ${x + 4} 634 Z`, cool ? '#d9ede0ca' : '#f6da87d9');
    }
  }

  private paintLid(c: CanvasRenderingContext2D) {
    const lid = c.createLinearGradient(0, 191, 0, 251);
    lid.addColorStop(0, '#b4b481'); lid.addColorStop(0.45, '#7e966b'); lid.addColorStop(1, '#3e634a');
    this.path(c, 'M153 229 Q183 190 384 189 Q586 190 615 229 Q589 260 384 263 Q180 261 153 229 Z', lid, '#183b2c', 3);
    this.path(c, 'M169 225 Q384 189 601 225 M169 235 Q384 269 600 236', undefined, '#d3c48b80', 2);
    this.ellipse(c, 384, 199, 38, 9, '#436249', '#bfb57b80', 2);
    this.path(c, 'M362 196 Q357 175 369 171 L399 171 Q411 176 406 196 L397 196 L397 183 Q384 177 371 183 L371 196 Z', '#8b9868', '#324f36', 2);
    this.path(c, 'M366 179 Q383 168 402 179', undefined, '#d0c38b80', 2);
    this.path(c, 'M319 222 L330 214 L341 222 L330 230 Z M319 222 L341 222 M435 222 L446 214 L457 222 L446 230 Z M435 222 L457 222', undefined, '#d5c48b60', 1);
  }

  private paintTool(c: CanvasRenderingContext2D, pointer: { x: number; y: number }, tool: string, time: number, selectedColor?: string) {
    const x = GRID_X + pointer.x * STEP, y = GRID_Y + pointer.y * STEP;
    if (x < 116 || x > 648 || y < 194 || y > 592) return;
    if (tool === 'inspect') {
      c.save(); c.translate(x, y); c.rotate(-0.35);
      this.path(c, 'M-17 17 L-43 46', undefined, '#1d352c', 12);
      this.path(c, 'M-17 17 L-43 46', undefined, '#b49660', 7);
      this.ellipse(c, 0, 0, 24, 24, '#d1ead30a', '#263d2c', 6);
      this.ellipse(c, 0, 0, 24, 24, '#d1ead30a', '#bba470', 3);
      this.path(c, 'M-13 -11 Q-6 -20 7 -17', undefined, '#e6e3be80', 2);
      this.path(c, 'M-6 0 L6 0 M0 -6 L0 6', undefined, '#f4e5b088', 1);
      c.restore(); return;
    }
    if (tool === 'pour') {
      c.save(); c.translate(x + 35, y - 42); c.rotate(-0.72);
      this.bottle(c, 0, 0, 17, 49, selectedColor ?? '#9c87b3', 'round');
      c.restore();
      this.ellipse(c, x, y, 14, 5, '#e5dbaa12', '#d7d3a666', 1);
      return;
    }
    c.save(); c.translate(x, y); c.rotate(-0.42);
    const swing = Math.sin(time * 1.5) * 0.6;
    if (tool === 'crush') {
      this.path(c, 'M-12 -14 L-10 -106 Q0 -124 10 -106 L12 -14 Q10 8 0 10 Q-10 8 -12 -14 Z', '#8b9c80', '#2b4736', 3);
      this.path(c, 'M-5 -101 L-5 -21', undefined, '#c3c6a785', 3);
      this.ellipse(c, 0, 1, 13, 7, '#697e63', '#c0bd8855', 1);
    } else {
      this.path(c, `M-4 -13 L${-3 + swing} -132 Q0 -140 5 -132 L4 -12 Z`, '#b89e63', '#384631', 2);
      this.path(c, 'M0 -126 L0 -22', undefined, '#e4cb8d70', 1);
      this.ellipse(c, 0, 0, 13, 22, '#a0955d', '#394c34', 2);
      this.ellipse(c, 0, -1, 9, 16, '#736f46', '#ddc68350', 1);
      this.path(c, 'M-7 -10 Q-13 3 -4 12', undefined, '#e1c98b85', 1.5);
    }
    c.restore();
  }

  private paintAtmosphere(c: CanvasRenderingContext2D, time: number, options: LaboratoryOptions) {
    if (options.quality === 'low' || options.reducedMotion) return;
    // Quiet motes belong to the workshop light, never the cauldron's simulated contents.
    for (let i = 0; i < 15; i++) {
      const x = 223 + random(i + 807) * 320 + Math.sin(time * 0.2 + i) * 7;
      const y = 16 + (random(i + 196) * 191 + time * (0.9 + random(i) * 1.2)) % 184;
      const alpha = 0.1 + (Math.sin(time * 0.7 + i) + 1) * 0.08;
      this.ellipse(c, x, y, 0.7 + random(i) * 0.5, 0.7 + random(i) * 0.5, `rgba(223,222,176,${alpha})`);
    }
  }
}
