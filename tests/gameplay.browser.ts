import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { GameState, Ingredient, World } from '../src/core/types';

interface Diagnostics { state: GameState; world: World; mass: number }

/** Diagnostics only inspect authoritative state. Every game action below goes through the UI. */
async function inspect(page: Page): Promise<Diagnostics> {
  return page.evaluate(() => {
    const debug = (window as unknown as {
      __POTION_DEV__: { game: { state: GameState; world: World; sim: { metrics(): { mass: number } } } };
    }).__POTION_DEV__;
    return { state: debug.game.state, world: debug.game.world, mass: debug.game.sim.metrics().mass };
  });
}

async function openGame(page: Page) {
  await page.goto('./?debug=1');
  await expect(page.locator('#brew-canvas')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean((window as unknown as { __POTION_DEV__?: unknown }).__POTION_DEV__))).toBe(true);
}

async function navigate(page: Page, name: 'Brew' | 'Explore' | 'Trials' | 'Journal' | 'Shop') {
  await page.getByRole('button', { name, exact: true }).click();
}

async function createWorld(page: Page, seed: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('New world seed', { exact: true }).fill(seed);
  await page.getByRole('button', { name: 'Create a new world', exact: false }).click();
  await page.getByRole('button', { name: 'Create new world', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).state.seed).toBe(seed);
}

async function openIngredientShelf(page: Page): Promise<Locator | null> {
  const open = page.getByRole('button', { name: 'Open ingredients', exact: true });
  if (!(await open.isVisible())) return null;
  await open.click();
  const drawer = page.getByRole('dialog', { name: 'Your ingredient shelf', exact: true });
  await expect(drawer).toBeVisible();
  await assertNoOverflow(page);
  return drawer;
}

async function addIngredient(page: Page, ingredient: Ingredient, amount: number) {
  await navigate(page, 'Brew');
  const drawer = await openIngredientShelf(page);
  const scope = drawer ?? page.locator('[data-panel="brew"]');
  let remaining = amount;
  while (remaining > 0) {
    const portion = [40, 24, 16, 8].find(value => value <= remaining);
    if (!portion) throw new Error('The measured UI portions must be multiples of eight.');
    await scope.locator(drawer ? '#drawer-amount' : '#add-amount').selectOption(String(portion));
    await scope.getByRole('button', { name: `Add ${ingredient.name}`, exact: true }).click();
    remaining -= portion;
  }
  if (drawer) await drawer.getByRole('button', { name: 'Return to cauldron', exact: true }).click();
}

async function assertNoOverflow(page: Page) {
  const { width, content } = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(content, `content width ${content} exceeds viewport ${width}`).toBeLessThanOrEqual(width + 1);
}

test('complete mobile commission: gather, brew, test, refine, sell, upgrade and resume', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openGame(page);
  const fresh = await inspect(page);
  expect(fresh.state.sales).toBe(0);
  await expect(page.getByText(fresh.state.commission.customer, { exact: false }).first()).toBeVisible();

  const desired = fresh.state.commission.requirements.find(r => r.min !== undefined && r.property in fresh.world.ingredients[0].effects)?.property ?? 'healing';
  const available = fresh.world.ingredients.filter(i => (fresh.state.inventory[i.id] ?? 0) >= 12);
  const base = [...available].sort((a, b) => Number(b.effects[desired as keyof Ingredient['effects']] ?? 0) - Number(a.effects[desired as keyof Ingredient['effects']] ?? 0))[0];
  expect(base).toBeDefined();
  const initialShelf = await openIngredientShelf(page);
  if (initialShelf) await page.screenshot({ path: 'work/screenshots/390-844-ingredients.png' });
  await (initialShelf ?? page.locator('[data-panel="brew"]')).getByRole('button', { name: `Inspect ${base.name}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(base.description);
  await page.getByRole('button', { name: /^Close / }).click();

  await navigate(page, 'Explore');
  const beforeGather = await inspect(page);
  await page.getByRole('button', { name: /^Gather / }).first().click();
  await expect.poll(async () => Object.values((await inspect(page)).state.inventory).reduce((sum, amount) => sum + amount, 0)).toBeGreaterThan(Object.values(beforeGather.state.inventory).reduce((sum, amount) => sum + amount, 0));

  const solvent = fresh.world.ingredients.find(i => i.id === 'water')!;
  await addIngredient(page, solvent, 24);
  await addIngredient(page, base, Math.min(48, Math.floor(fresh.state.inventory[base.id] / 8) * 8));
  await expect.poll(async () => (await inspect(page)).mass).toBeGreaterThan(8);
  await page.getByRole('button', { name: 'Stir', exact: true }).click();
  const canvas = page.locator('#brew-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .42, y: bounds.y + bounds.height * .8, id: 1 }] });
    for (let n = 0; n <= 16; n++) {
      const angle = n * Math.PI / 8;
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width * (.5 + .08 * Math.cos(angle)), y: bounds.y + bounds.height * (.8 + .025 * Math.sin(angle)), id: 1 }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  }
  await page.getByRole('slider', { name: 'Furnace heat' }).focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Cool mixture', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle lid', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle lid', exact: true }).click();

  await navigate(page, 'Trials');
  const sampleMass = (await inspect(page)).mass;
  await page.getByRole('button', { name: /^Test on / }).first().click();
  await expect.poll(async () => (await inspect(page)).state.journal.length).toBe(1);
  const firstTest = await inspect(page);
  expect(firstTest.mass).toBeLessThan(sampleMass);
  await expect(page.getByText(firstTest.state.journal[0].observation, { exact: false }).first()).toBeVisible();
  expect(Object.keys(firstTest.state.journal[0].metrics).length).toBeGreaterThan(0);

  const refinement = available.find(i => i.id !== base.id && i.id !== 'water')!;
  expect(refinement).toBeDefined();
  await addIngredient(page, refinement, 8);
  await navigate(page, 'Trials');
  await page.getByRole('button', { name: /^Test on / }).first().click();
  await expect.poll(async () => (await inspect(page)).state.journal.length).toBe(2);
  const secondTest = await inspect(page);
  expect(secondTest.state.journal[0].signature).not.toBe(secondTest.state.journal[1].signature);

  await navigate(page, 'Brew');
  await page.getByRole('button', { name: 'Bottle mixture', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).state.bottles.length).toBe(1);
  const beforeSale = await inspect(page);
  await navigate(page, 'Shop');
  await page.getByRole('button', { name: /^Sell / }).first().click();
  await expect.poll(async () => (await inspect(page)).state.sales).toBe(1);
  const sold = await inspect(page);
  expect(sold.state.coins).toBeGreaterThan(beforeSale.state.coins);
  expect(sold.state.commission.id).not.toBe(beforeSale.state.commission.id);
  const upgrade = page.getByRole('button', { name: /^Purchase / }).filter({ hasNot: page.locator('[disabled]') });
  const enabled = await upgrade.all();
  let purchased = false;
  for (const button of enabled) {
    if (await button.isEnabled()) { await button.click(); purchased = true; break; }
  }
  expect(purchased, 'first commission should leave an affordable progression purchase').toBe(true);
  const saved = await inspect(page);
  expect(saved.state.upgrades.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#brew-canvas')).toBeVisible();
  const resumed = await inspect(page);
  expect(resumed.state.sales).toBe(saved.state.sales);
  expect(resumed.state.coins).toBe(saved.state.coins);
  expect(resumed.state.upgrades).toEqual(saved.state.upgrades);
  expect(resumed.state.journal).toEqual(saved.state.journal);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 844, height: 390 }]) {
  test(`responsive panels and keyboard controls at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    for (const name of ['Brew', 'Explore', 'Trials', 'Journal', 'Shop'] as const) {
      await navigate(page, name);
      await assertNoOverflow(page);
      const target = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(target?.height, 'primary navigation needs a comfortable touch target').toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `work/screenshots/${viewport.width}-${viewport.height}-${name.toLowerCase()}.png`, fullPage: true });
    }
    await navigate(page, 'Brew');
    await page.getByRole('button', { name: 'Stir', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Stir', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Settings', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertNoOverflow(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  });
}

test('static repository subpath installs and resumes offline with local state', async ({ page, context }) => {
  const requested: string[] = [];
  page.on('request', request => { if (request.url().startsWith('http')) requested.push(request.url()); });
  await openGame(page);
  const pathname = new URL(page.url()).pathname;
  expect(pathname).toContain('/potion-brewer-codex/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect.poll(async () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration()))).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  expect(requested.filter(url => new URL(url).origin !== new URL(page.url()).origin), 'all game resources must be bundled for offline play').toEqual([]);
  await page.reload();
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const before = await inspect(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#brew-canvas')).toBeVisible();
  expect((await inspect(page)).state.seed).toBe(before.state.seed);
  const ingredient = before.world.ingredients.find(i => (before.state.inventory[i.id] ?? 0) >= 40)!;
  await addIngredient(page, ingredient, 40);
  await expect.poll(async () => (await inspect(page)).mass).toBeGreaterThan(0);
  await navigate(page, 'Trials');
  await page.getByRole('button', { name: /^Test on / }).first().click();
  await expect.poll(async () => (await inspect(page)).state.journal.length).toBe(1);
  await navigate(page, 'Brew');
  await page.getByRole('button', { name: 'Bottle mixture', exact: true }).click();
  await navigate(page, 'Shop');
  await page.getByRole('button', { name: /^Sell / }).first().click();
  await expect.poll(async () => (await inspect(page)).state.sales).toBe(1);
  await page.reload();
  await expect(page.locator('#brew-canvas')).toBeVisible();
  await expect.poll(async () => (await inspect(page)).mass).toBeGreaterThan(0);
  expect((await inspect(page)).state.sales).toBe(1);
  await context.setOffline(false);
});

test('new worlds reproduce ingredient properties for the same seed', async ({ page }) => {
  await openGame(page);
  await createWorld(page, 'qa-bellflower');
  const first = await inspect(page);
  await createWorld(page, 'qa-frostglass');
  const second = await inspect(page);
  expect(second.world.ingredients).not.toEqual(first.world.ingredients);
  expect(second.state.commission.requirements).toEqual(first.state.commission.requirements);
  await createWorld(page, 'qa-bellflower');
  expect((await inspect(page)).world).toEqual(first.world);
});

test('sandbox isolation and portable save export/import preserve the working shop', async ({ page }) => {
  await openGame(page);
  const world = (await inspect(page)).world;
  await addIngredient(page, world.ingredients.find(i => i.id === 'water')!, 24);
  const shop = await inspect(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Enter sandbox', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).state.mode).toBe('sandbox');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await addIngredient(page, world.ingredients.find(i => i.id === 'void-ink')!, 40);
  expect((await inspect(page)).mass).toBeGreaterThan(30);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save', exact: true }).click();
  const download = await downloadEvent;
  const save = await readFile((await download.path())!, 'utf8');
  const portable = JSON.parse(save) as { format: string; state: GameState };
  expect(portable.format).toBe('potion-brewer');
  expect(portable.state.mode).toBe('shop');
  expect(portable.state.coins).toBe(shop.state.coins);
  expect(portable.state.inventory).toEqual(shop.state.inventory);
  await page.getByRole('button', { name: 'Return to shop', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  const returned = await inspect(page);
  expect(returned.state.inventory).toEqual(shop.state.inventory);
  expect(returned.mass).toBeCloseTo(shop.mass, 3);

  await createWorld(page, 'qa-portable-replacement');
  await page.locator('#save-file').setInputFiles({ name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(save) });
  await expect.poll(async () => (await inspect(page)).state.seed).toBe(shop.state.seed);
  expect((await inspect(page)).state.inventory).toEqual(shop.state.inventory);
  expect((await inspect(page)).mass).toBeCloseTo(shop.mass, 3);
  await page.locator('#save-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#toast-message')).toContainText('not a valid');
  expect((await inspect(page)).state.seed).toBe(shop.state.seed);
});

test('a representative busy sandbox remains finite while heating and circulating', async ({ page }, testInfo) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Enter sandbox', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  const world = (await inspect(page)).world;
  await addIngredient(page, world.ingredients.find(i => i.id === 'water')!, 640);
  await addIngredient(page, world.ingredients.find(i => i.id === 'sun-oil')!, 400);
  await addIngredient(page, world.ingredients.find(i => i.id === 'frost-salt')!, 320);
  await page.getByRole('slider', { name: 'Furnace heat' }).focus();
  await page.keyboard.press('End');
  const timing = await page.evaluate(async () => {
    const debug = (window as unknown as { __POTION_DEV__: { performance: { frames: number; simulationMs: number } } }).__POTION_DEV__;
    const start = performance.now();
    const firstFrame = debug.performance.frames;
    const costs: number[] = [];
    await new Promise<void>(resolve => {
      const measure = () => {
        costs.push(debug.performance.simulationMs);
        if (performance.now() - start >= 3000) resolve();
        else requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
    });
    const durationMs = performance.now() - start;
    costs.sort((a, b) => a - b);
    return {
      durationMs,
      measuredFPS: (debug.performance.frames - firstFrame) * 1000 / durationMs,
      simulationMedianMs: costs[Math.floor(costs.length / 2)],
      simulationP95Ms: costs[Math.floor(costs.length * .95)],
    };
  });
  const diagnostics = await page.evaluate(() => {
    const { game, performance: profile } = (window as unknown as { __POTION_DEV__: {
      game: { sim: { cells: Array<{ mass: number; temperature: number; composition: Record<string, number> } | null>; metrics(): Record<string, number> } };
      performance: { fps: number; frameMs: number; simulationMs: number; frames: number };
    } }).__POTION_DEV__;
    const cells = game.sim.cells.filter(cell => cell !== null);
    return {
      ...profile,
      activeCells: cells.length,
      finite: cells.every(cell => cell && Number.isFinite(cell.mass) && Number.isFinite(cell.temperature) && Object.values(cell.composition).every(Number.isFinite)),
      metricsFinite: Object.values(game.sim.metrics()).every(Number.isFinite),
    };
  });
  expect(diagnostics.activeCells).toBeGreaterThan(500);
  expect(diagnostics.finite).toBe(true);
  expect(diagnostics.metricsFinite).toBe(true);
  const profile = { ...diagnostics, ...timing };
  console.info('Headless Chromium busy-mixture profile:', JSON.stringify(profile));
  await testInfo.attach('headless-chromium-performance', { body: JSON.stringify(profile, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: 'work/screenshots/390-844-busy-brew.png', fullPage: true });
});
