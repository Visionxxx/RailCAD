import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  clickWorld, createLineNumeric, field, menu, openApp, selectTool, setField, viewInfo, worldToPage,
} from './helpers';

test('starter uten feil og viser tegneflate, verktøy og statuslinje', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.getByTestId('tool-line')).toBeVisible();
  await expect(page.getByTestId('statusbar')).toContainText('px/m');
  await expect(page.locator('svg pattern#pat-minor')).toHaveCount(1);
  await expect(page.getByTestId('object-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('RC-002/RC-004: tegn rett spor numerisk og endre lengde i egenskapspanelet (scenario B)', async ({ page }) => {
  const errors = await openApp(page);
  await createLineNumeric(page, { length: '140' });
  await expect(page.getByTestId('object-track-001')).toContainText('140,000 m');
  await selectTool(page, 'select');
  await page.getByTestId('object-track-001').click();
  await expect(field(page, 'prop-length')).toHaveValue('140,000');
  await expect(page.getByTestId('prop-end')).toHaveText('140,000 / 0,000');

  await setField(page, 'prop-length', '150');
  await expect(field(page, 'prop-length')).toHaveValue('150,000');
  await expect(page.getByTestId('object-track-001')).toContainText('150,000 m');
  await expect(page.getByTestId('prop-end')).toHaveText('150,000 / 0,000');
  expect(errors).toEqual([]);
});

test('RC-004: ugyldige verdier gir tydelig feilmelding og endrer ikke modellen', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '140' });
  await selectTool(page, 'select');
  await page.getByTestId('object-track-001').click();
  await setField(page, 'prop-length', '0');
  await expect(page.getByRole('alert').first()).toContainText('Lengde må være et positivt');
  await setField(page, 'prop-length', 'abc');
  await expect(page.getByRole('alert').first()).toContainText('Ugyldig tall');
  await expect(page.getByTestId('object-track-001')).toContainText('140,000 m');
  await selectTool(page, 'line');
  await page.getByTestId('new-length').fill('-5');
  await page.getByTestId('create-line').click();
  await expect(page.getByTestId('options-line').getByRole('alert')).toContainText('Lengde');
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(1);
});

test('RC-002/RC-005/RC-006: tegn spor med musen med presis snapping og lengdevisning', async ({ page }) => {
  await openApp(page);
  await selectTool(page, 'line');
  const a = await worldToPage(page, 0, 0);
  const near = { x: a.x + 3, y: a.y - 2 }; // litt ved siden av rutenettpunktet – snap må trekke til (0,0)
  await page.mouse.move(near.x, near.y);
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'grid');
  await page.mouse.click(near.x, near.y);
  const b = await worldToPage(page, 30, 0);
  await page.mouse.move(b.x + 2, b.y + 3);
  await expect(page.getByTestId('hud')).toContainText('30,000 m');
  await page.mouse.click(b.x + 2, b.y + 3);

  await expect(page.getByTestId('object-track-001')).toContainText('30,000 m');
  await expect(field(page, 'prop-start-x')).toHaveValue('0,000');
  await expect(field(page, 'prop-heading')).toHaveValue('0,0000');
});

test('RC-005: snapper til endepunkt på eksisterende spor', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '30' });
  await selectTool(page, 'line');
  const p = await worldToPage(page, 30, 0);
  await page.mouse.move(p.x + 5, p.y + 4);
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'endpoint');
  await page.getByTestId('snap-endpoint').click(); // slå av
  await page.mouse.move(p.x + 6, p.y + 4);
  await expect(page.getByTestId('snap-marker')).not.toHaveAttribute('data-kind', 'endpoint');
});

test('RC-003: tegn sirkelkurve og endre radius (scenario C)', async ({ page }) => {
  await openApp(page);
  await selectTool(page, 'arc');
  const f = page.getByTestId('options-arc');
  await f.getByTestId('new-radius').fill('100');
  await f.getByTestId('new-sweep').fill('90');
  await page.getByTestId('create-arc').click();
  await expect(page.getByTestId('prop-end')).toHaveText('100,000 / 100,000');
  await expect(field(page, 'prop-arclength')).toHaveValue('157,080');

  await setField(page, 'prop-radius', '200');
  await expect(page.getByTestId('prop-end')).toHaveText('200,000 / 200,000');
  await expect(field(page, 'prop-heading')).toHaveValue('0,0000'); // starttangent låst
  await expect(field(page, 'prop-start-x')).toHaveValue('0,000');

  await page.getByTestId('prop-side').selectOption('right');
  await expect(page.getByTestId('prop-end')).toHaveText('200,000 / -200,000');
  await setField(page, 'prop-sweep', '30');
  await expect(field(page, 'prop-arclength')).toHaveValue('104,720');
  await setField(page, 'prop-sweep', '400');
  await expect(page.getByRole('alert').first()).toContainText('Sweep');
});

test('RC-009/scenario A+B: parallelle spor er uavhengige kopier', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '140' });
  await page.keyboard.press('f'); // tilpass visning
  await selectTool(page, 'parallel');
  await page.getByTestId('parallel-distance').fill('5');
  await page.getByTestId('parallel-distance').press('Enter');
  await page.getByTestId('parallel-side').selectOption('left');
  await clickWorld(page, 70, 0);
  await clickWorld(page, 70, 5);
  await page.getByTestId('parallel-side').selectOption('right');
  await clickWorld(page, 70, 0);
  await clickWorld(page, 70, -5);

  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(3);
  await selectTool(page, 'select');
  await page.getByTestId('object-track-002').click();
  await expect(field(page, 'prop-start-y')).toHaveValue('5,000');
  await expect(field(page, 'prop-length')).toHaveValue('140,000');
  await page.getByTestId('object-track-003').click();
  await expect(field(page, 'prop-start-y')).toHaveValue('-5,000');

  await page.getByTestId('object-track-001').click();
  await setField(page, 'prop-length', '150');
  await expect(page.getByTestId('object-track-001')).toContainText('150,000 m');
  await expect(page.getByTestId('object-track-002')).toContainText('140,000 m');
  await expect(page.getByTestId('object-track-003')).toContainText('140,000 m');
});

test('RC-008: lengdemål følger sporet og er synlig etter lagring og åpning (scenario D)', async ({ page }, info) => {
  await openApp(page);
  await createLineNumeric(page, { length: '140' });
  await page.keyboard.press('f');
  await selectTool(page, 'measure-length');
  await clickWorld(page, 70, 0);
  const p = await worldToPage(page, 70, 3);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('140,000 m');

  await selectTool(page, 'select');
  await page.getByTestId('object-track-001').click();
  await setField(page, 'prop-length', '150');
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('150,000 m');

  // Lagre
  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-save').click()]);
  const path = info.outputPath('lagret.railcad.json');
  await download.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.schemaVersion).toBe('0.1.0');
  expect(saved.objects[0].geometry.lengthM).toBe(150);
  expect(saved.objects[1].dimension).toMatchObject({ kind: 'length', targetId: 'track-001' });

  // Nytt prosjekt, deretter åpne filen
  await menu(page, 'file', 'menu-new');
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(0);
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('menu-open').click()]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('object-track-001')).toContainText('150,000 m');
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('150,000 m');

  // Lagre igjen: identisk innhold (ingen tap av geometri)
  await page.getByTestId('menu-file').click();
  const [again] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-save').click()]);
  const path2 = info.outputPath('lagret2.railcad.json');
  await again.saveAs(path2);
  expect(JSON.parse(readFileSync(path2, 'utf8'))).toEqual(saved);
});

test('RC-007: minst 50 handlinger kan angres og gjøres om', async ({ page }) => {
  await openApp(page);
  await selectTool(page, 'line');
  const count = 55;
  for (let i = 0; i < count; i++) {
    await page.getByTestId('new-y').fill(String(i));
    await page.getByTestId('new-length').fill(String(10 + i));
    await page.getByTestId('create-line').click();
  }
  const rows = page.getByTestId('object-list').locator('li');
  await expect(rows).toHaveCount(count);
  for (let i = 0; i < count; i++) await page.keyboard.press('Control+z');
  await expect(rows).toHaveCount(0);
  for (let i = 0; i < count; i++) await page.keyboard.press('Control+y');
  await expect(rows).toHaveCount(count);
  await expect(page.getByTestId('object-track-055')).toContainText('64,000 m');
});

test('RC-001: ugyldig prosjektfil avvises med forklaring og endrer ikke prosjektet', async ({ page }, info) => {
  const { writeFileSync } = await import('node:fs');
  await openApp(page);
  await createLineNumeric(page, { length: '10' });
  await menu(page, 'file', 'menu-save').catch(() => undefined);
  const bad = info.outputPath('ugyldig.json');
  writeFileSync(bad, JSON.stringify({
    schemaVersion: '0.1.0',
    project: { id: 'x', name: 'x', units: 'm', coordinateSystem: { type: 'local_xy' } },
    objects: [{ id: 't', type: 'track_segment', geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: -4 } }],
    connections: [],
  }));
  // Prosjektet er ulagret (dirty) → bekreft forkasting først hvis dialogen vises.
  await page.getByTestId('menu-file').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('menu-open').click();
  if (await page.getByTestId('dialog-confirm').isVisible().catch(() => false)) {
    await page.getByTestId('dialog-confirm').click();
  }
  const chooser = await chooserPromise;
  await chooser.setFiles(bad);
  await expect(page.getByTestId('dialog')).toContainText('Lengde må være et positivt');
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('object-track-001')).toBeVisible();
});

test('eksempelprosjekt åpnes med tre parallelle spor à 140 m', async ({ page }) => {
  const errors = await openApp(page);
  await menu(page, 'file', 'menu-demo');
  for (const id of ['track-001', 'track-002', 'track-003']) {
    await expect(page.getByTestId(`object-${id}`)).toContainText('140,000 m');
  }
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('140,000 m');
  await expect(page.getByTestId('dim-label-dim-002')).toHaveText('10,000 m');
  expect(errors).toEqual([]);
});

test('zoom rundt markøren, panorering og direkte redigering av endepunkt med musen', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '40' });
  const before = await worldToPage(page, 20, 0);
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel(0, -300);
  const after = await worldToPage(page, 20, 0);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1.5); // punktet under markøren står i ro
  expect((await viewInfo(page)).scale).toBeGreaterThan(10);

  await page.getByTestId('viewport').focus();
  await page.keyboard.down('Space');
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(460, 430, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const panned = await worldToPage(page, 20, 0);
  expect(Math.abs(panned.x - after.x - 60)).toBeLessThan(1.5);

  // Dra sluttgrepet til (30, 0) – snapper til rutenettet
  await selectTool(page, 'select');
  await page.getByTestId('object-track-001').click();
  await page.keyboard.press('f'); // tilpass visning så sluttpunktet er synlig
  const end = await worldToPage(page, 40, 0);
  const target = await worldToPage(page, 30, 0);
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await expect(field(page, 'prop-length')).toHaveValue('30,000');
});

test('ytelse: 5000 spor åpnes og zoom forblir responsiv', async ({ page }, info) => {
  const { writeFileSync } = await import('node:fs');
  await openApp(page);
  const objects = Array.from({ length: 5000 }, (_, i) => ({
    id: `track-${String(i + 1).padStart(4, '0')}`,
    type: 'track_segment',
    geometry: { kind: i % 5 === 0 ? 'arc' : 'line', start: [(i % 100) * 12, Math.floor(i / 100) * 6], headingRad: 0,
      ...(i % 5 === 0 ? { signedRadiusM: 80, sweepRad: 0.2 } : { lengthM: 10 }) },
  }));
  const file = info.outputPath('stor.json');
  writeFileSync(file, JSON.stringify({
    schemaVersion: '0.1.0',
    project: { id: 'stor', name: 'Stort', units: 'm', coordinateSystem: { type: 'local_xy' } },
    objects, connections: [],
  }));
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('menu-open').click()]);
  await chooser.setFiles(file);
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(5000);

  const ms = await page.evaluate(async () => {
    const vp = document.querySelector('[data-testid=viewport]') as HTMLElement;
    const r = vp.getBoundingClientRect();
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      vp.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? 120 : -120, clientX: r.x + 500, clientY: r.y + 300, bubbles: true, cancelable: true }));
      await new Promise((res) => requestAnimationFrame(res));
    }
    return (performance.now() - t0) / 30;
  });
  console.log(`snitt per zoomsteg med 5000 spor: ${ms.toFixed(1)} ms`);
  expect(ms).toBeLessThan(100);
});

test('flytt (dra), roter (numerisk) og slett med tilknyttet mål – kan angres', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '40' });
  await selectTool(page, 'measure-length');
  await clickWorld(page, 20, 0);
  await clickWorld(page, 20, 4);
  await expect(page.getByTestId('object-dim-001')).toBeVisible();

  // Flytt: dra sporet fra (10, 0) til (10, 6)
  await selectTool(page, 'select');
  const from = await worldToPage(page, 10, 0);
  const to = await worldToPage(page, 10, 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect(field(page, 'prop-start-y')).toHaveValue('6,000');
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('40,000 m');

  // Roter 90° om startpunktet (0, 6)
  await selectTool(page, 'rotate');
  await clickWorld(page, 0, 6);
  await page.getByTestId('rotate-angle').fill('90');
  await page.getByTestId('rotate-apply').click();
  await selectTool(page, 'select');
  await page.getByTestId('object-track-001').click();
  await expect(field(page, 'prop-heading')).toHaveValue('90,0000');
  await expect(page.getByTestId('prop-end')).toHaveText('0,000 / 46,000');

  // Slett med slett-verktøyet: sporet og lengdemålet forsvinner sammen
  await page.keyboard.press('f');
  await selectTool(page, 'delete');
  await clickWorld(page, 0, 26);
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(2);
});

test('RC-003/RC-005: bue tegnet med musen fortsetter tangentielt fra sporendepunkt', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '40' });
  await selectTool(page, 'arc');
  await clickWorld(page, 40, 0);
  await expect(page.getByTestId('hint')).toContainText('Klikk sluttpunkt');
  const p = await worldToPage(page, 60, 10);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('hud')).toContainText('R = 25,000 m (venstre)');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('object-track-002')).toContainText('R 25,0 m');
  await expect(field(page, 'prop-start-x')).toHaveValue('40,000');
  await expect(field(page, 'prop-heading')).toHaveValue('0,0000');
  await expect(page.getByTestId('prop-end')).toHaveText('60,000 / 10,000');
});
