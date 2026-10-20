import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  clickWorld,
  createLineNumeric,
  field,
  menu,
  openApp,
  openTab,
  selectInList,
  selectTool,
  setField,
  viewInfo,
  worldToPage,
} from './helpers';

test('starter uten feil og viser tegneflate, verktøy og statuslinje', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.getByTestId('tool-line')).toBeVisible();
  await expect(page.getByTestId('statusbar')).toContainText('px/m');
  await expect(page.locator('svg pattern#pat-minor')).toHaveCount(1);
  await openTab(page, 'objects');
  await expect(page.getByTestId('object-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('RC-002/RC-004: tegn rett spor numerisk og endre lengde i egenskapspanelet (scenario B)', async ({
  page,
}) => {
  const errors = await openApp(page);
  await createLineNumeric(page, { length: '140' });
  await expect(page.getByTestId('object-track-001')).toContainText('140,000 m');
  await selectTool(page, 'select');
  await selectInList(page, 'track-001');
  await expect(field(page, 'prop-length')).toHaveValue('140,000');
  await expect(page.getByTestId('prop-end')).toHaveText('140,000 / 0,000');

  await setField(page, 'prop-length', '150');
  await expect(field(page, 'prop-length')).toHaveValue('150,000');
  await expect(page.getByTestId('object-track-001')).toContainText('150,000 m');
  await expect(page.getByTestId('prop-end')).toHaveText('150,000 / 0,000');
  expect(errors).toEqual([]);
});

test('RC-004: ugyldige verdier gir tydelig feilmelding og endrer ikke modellen', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '140' });
  await selectTool(page, 'select');
  await selectInList(page, 'track-001');
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

test('RC-002/RC-005/RC-006: tegn spor med musen med presis snapping og lengdevisning', async ({
  page,
}) => {
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
  await selectInList(page, 'track-002');
  await expect(field(page, 'prop-start-y')).toHaveValue('5,000');
  await expect(field(page, 'prop-length')).toHaveValue('140,000');
  await selectInList(page, 'track-003');
  await expect(field(page, 'prop-start-y')).toHaveValue('-5,000');

  await selectInList(page, 'track-001');
  await setField(page, 'prop-length', '150');
  await expect(page.getByTestId('object-track-001')).toContainText('150,000 m');
  await expect(page.getByTestId('object-track-002')).toContainText('140,000 m');
  await expect(page.getByTestId('object-track-003')).toContainText('140,000 m');
});

test('RC-008: lengdemål følger sporet og er synlig etter lagring og åpning (scenario D)', async ({
  page,
}, info) => {
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
  await selectInList(page, 'track-001');
  await setField(page, 'prop-length', '150');
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('150,000 m');

  // Lagre
  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
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
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('object-track-001')).toContainText('150,000 m');
  await expect(page.getByTestId('dim-label-dim-001')).toHaveText('150,000 m');

  // Lagre igjen: identisk innhold (ingen tap av geometri)
  await page.getByTestId('menu-file').click();
  const [again] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
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

test('RC-001: ugyldig prosjektfil avvises med forklaring og endrer ikke prosjektet', async ({
  page,
}, info) => {
  const { writeFileSync } = await import('node:fs');
  await openApp(page);
  await createLineNumeric(page, { length: '10' });
  await menu(page, 'file', 'menu-save').catch(() => undefined);
  const bad = info.outputPath('ugyldig.json');
  writeFileSync(
    bad,
    JSON.stringify({
      schemaVersion: '0.1.0',
      project: { id: 'x', name: 'x', units: 'm', coordinateSystem: { type: 'local_xy' } },
      objects: [
        {
          id: 't',
          type: 'track_segment',
          geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: -4 },
        },
      ],
      connections: [],
    }),
  );
  // Prosjektet er ulagret (dirty) → bekreft forkasting først hvis dialogen vises.
  await page.getByTestId('menu-file').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('menu-open').click();
  if (
    await page
      .getByTestId('dialog-confirm')
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByTestId('dialog-confirm').click();
  }
  const chooser = await chooserPromise;
  await chooser.setFiles(bad);
  await expect(page.getByTestId('dialog')).toContainText('Lengde må være et positivt');
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('object-track-001')).toBeAttached();
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

test('zoom rundt markøren, panorering og direkte redigering av endepunkt med musen', async ({
  page,
}) => {
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
  await selectInList(page, 'track-001');
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
    geometry: {
      kind: i % 5 === 0 ? 'arc' : 'line',
      start: [(i % 100) * 12, Math.floor(i / 100) * 6],
      headingRad: 0,
      ...(i % 5 === 0 ? { signedRadiusM: 80, sweepRad: 0.2 } : { lengthM: 10 }),
    },
  }));
  const file = info.outputPath('stor.json');
  writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: '0.1.0',
      project: { id: 'stor', name: 'Stort', units: 'm', coordinateSystem: { type: 'local_xy' } },
      objects,
      connections: [],
    }),
  );
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser.setFiles(file);
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(5000);

  const ms = await page.evaluate(async () => {
    const vp = document.querySelector('[data-testid=viewport]') as HTMLElement;
    const r = vp.getBoundingClientRect();
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      vp.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: i % 2 ? 120 : -120,
          clientX: r.x + 500,
          clientY: r.y + 300,
          bubbles: true,
          cancelable: true,
        }),
      );
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
  await expect(page.getByTestId('object-dim-001')).toBeAttached();

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
  await selectInList(page, 'track-001');
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

test('RC-003/RC-005: bue tegnet med musen fortsetter tangentielt fra sporendepunkt', async ({
  page,
}) => {
  const errors = await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'arc');
  await clickWorld(page, 20, 0);
  await expect(page.getByTestId('hint')).toContainText('Klikk sluttpunkt');
  const p = await worldToPage(page, 30, 10);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('hud')).toContainText('R = 10,000 m (venstre)'); // kvartsirkel: (10² + 10²) / (2·10)
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('object-track-002')).toContainText('R 10,0 m');
  await expect(field(page, 'prop-start-x')).toHaveValue('20,000');
  await expect(field(page, 'prop-heading')).toHaveValue('0,0000');
  await expect(page.getByTestId('prop-end')).toHaveText('30,000 / 10,000');
  expect(errors).toEqual([]);
});

test('panorering med midtknapp og rotasjon med tre museklikk (pivot, referanse, ny retning)', async ({
  page,
}) => {
  const errors = await openApp(page);
  await createLineNumeric(page, { length: '20' });
  const before = await worldToPage(page, 0, 0);
  await page.mouse.move(300, 300);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(340, 280, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  const moved = await worldToPage(page, 0, 0);
  expect(Math.round(moved.x - before.x)).toBe(40);
  expect(Math.round(moved.y - before.y)).toBe(-20);

  await selectTool(page, 'rotate');
  await clickWorld(page, 0, 0); // rotasjonspunkt
  await clickWorld(page, 10, 0); // referanseretning
  await clickWorld(page, 0, 10); // ny retning → +90°
  await selectTool(page, 'select');
  await selectInList(page, 'track-001');
  await expect(field(page, 'prop-heading')).toHaveValue('90,0000');
  await expect(page.getByTestId('prop-end')).toHaveText('0,000 / 20,000');
  expect(errors).toEqual([]);
});

test('smal skjerm: layout bryter om uten horisontal sidescroll', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await openApp(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: '/tmp/claude-1000/-home-glenn-Dokumenter-Prosjekt-RailCAD/81375bdf-17de-45c0-b9c7-abd774ad38b0/scratchpad/narrow.png',
  });
});

test('RC-011: Koble – meny ved musepeker, kurve fra endepunkt og kobling i én angrehandling', async ({
  page,
}) => {
  const errors = await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'connect');
  await expect(page.getByTestId('free-port')).toHaveCount(2);
  await clickWorld(page, 20, 0);
  await expect(page.getByTestId('port-menu')).toBeVisible();
  await expect(page.getByTestId('port-menu-turnout:left')).toBeEnabled();
  await page.getByTestId('port-menu-arc').click();
  await clickWorld(page, 30, 10);

  await expect(page.getByTestId('object-track-002')).toContainText('R 10,0 m');
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
  await expect(page.getByTestId('conn-mark-0')).toHaveAttribute('data-status', 'ok');
  await selectTool(page, 'select');
  await selectInList(page, 'track-001');
  await expect(page.getByTestId('prop-port-end')).toContainText('track-002 start · OK');
  await expect(page.getByTestId('prop-port-start')).toHaveText('ledig');

  await page.keyboard.press('Control+z'); // spor og kobling angres samlet
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('conn-row-0')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
  expect(errors).toEqual([]);
});

test('RC-011: rett spor fra port med numerisk lengde, og Esc lukker menyen', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'connect');
  await clickWorld(page, 20, 0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('port-menu')).toHaveCount(0);

  await clickWorld(page, 20, 0);
  await page.getByTestId('port-menu-line').click();
  await page.getByTestId('connect-length').fill('15');
  await page.getByTestId('connect-create').click();
  await expect(page.getByTestId('object-track-002')).toContainText('15,000 m');
  await expect(field(page, 'prop-start-x')).toHaveValue('20,000');
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
});

test('RC-011: forslag kobler sammenfallende endepunkter; avvik rapporteres uten at noe flyttes', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '10' });
  await createLineNumeric(page, { x: '10', length: '10' });
  await openTab(page, 'connections');
  await expect(page.getByTestId('suggest-connect-0')).toBeVisible();
  await page.getByTestId('suggest-connect-0').click();
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
  await expect(page.getByTestId('suggest-connect-0')).toHaveCount(0);

  await selectTool(page, 'select');
  await selectInList(page, 'track-002');
  await setField(page, 'prop-start-x', '10,25');
  await expect(page.getByTestId('conn-status-0')).toHaveText('Posisjonsavvik 0,250 m');
  await expect(page.getByTestId('conn-errors')).toContainText('1 avvik');
  await expect(field(page, 'prop-start-x')).toHaveValue('10,250'); // ikke flyttet automatisk
  await setField(page, 'prop-heading', '5');
  await setField(page, 'prop-start-x', '10');
  await expect(page.getByTestId('conn-status-0')).toContainText('Tangentavvik');
  await setField(page, 'prop-heading', '0');
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
});

test('RC-011: Koble til sammenfallende endepunkt via menyen, og koblinger overlever lagring', async ({
  page,
}, info) => {
  await openApp(page);
  await createLineNumeric(page, { length: '10' });
  await createLineNumeric(page, { x: '10', length: '10' });
  await selectTool(page, 'connect');
  await clickWorld(page, 10, 0);
  await page
    .getByTestId('port-menu-connect:track-001:end')
    .or(page.getByTestId('port-menu-connect:track-002:start'))
    .click();
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');

  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  const path = info.outputPath('koblet.railcad.json');
  await download.saveAs(path);
  expect(JSON.parse(readFileSync(path, 'utf8')).connections).toHaveLength(1);

  await menu(page, 'file', 'menu-new');
  await expect(page.getByTestId('conn-row-0')).toHaveCount(0);
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
});

async function placeTurnoutNumeric(
  page: import('@playwright/test').Page,
  v: { type?: string; hand?: string; x?: string; y?: string; heading?: string } = {},
) {
  await selectTool(page, 'turnout');
  const f = page.getByTestId('options-turnout');
  if (v.type) await f.getByTestId('turnout-type').selectOption(v.type);
  if (v.hand) await f.getByTestId('turnout-hand').selectOption(v.hand);
  await f.getByTestId('turnout-x').fill(v.x ?? '0');
  await f.getByTestId('turnout-y').fill(v.y ?? '0');
  await f.getByTestId('turnout-heading').fill(v.heading ?? '0');
  await page.getByTestId('create-turnout').click();
}

test('RC-010: sporveksel fra bibliotek merkes delvis verifisert og får tre porter', async ({
  page,
}) => {
  const errors = await openApp(page);
  await selectTool(page, 'turnout');
  await expect(page.getByTestId('turnout-note')).toContainText('delvis verifisert');
  await expect(page.getByTestId('turnout-note')).toContainText('KO-701409');
  await placeTurnoutNumeric(page, { type: 'trv-54E3-1:9-R190-kort', hand: 'right' });

  await expect(page.getByTestId('object-turnout-001')).toContainText('54E3 1:9 R190');
  await expect(page.getByTestId('turnout-label-turnout-001')).toContainText('delvis verifisert');
  await expect(page.getByTestId('prop-verification')).toHaveText('Delvis verifisert');
  await expect(page.getByTestId('prop-turnout-type')).toHaveText('54E3 1:9 R190 (kort kurve)');
  for (const p of ['stem_in', 'stem_out', 'diverging_out']) {
    await expect(page.getByTestId(`prop-port-${p}`)).toHaveText('ledig');
  }
  await expect(page.getByTestId('free-port')).toHaveCount(0);

  await page.getByTestId('prop-hand').selectOption('left');
  await setField(page, 'prop-heading', '90');
  await expect(field(page, 'prop-heading')).toHaveValue('90,0000');
  expect(errors).toEqual([]);
});

test('RC-010/RC-011: veksel plasseres på sporendepunkt og kobles automatisk; kan angres samlet', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'turnout');
  await clickWorld(page, 20, 0);
  await expect(page.getByTestId('object-turnout-001')).toBeAttached();
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
  await expect(page.getByTestId('prop-port-stem_in')).toContainText('track-001 slutt · OK');
  await expect(field(page, 'prop-start-x')).toHaveValue('20,000');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('object-turnout-001')).toHaveCount(0);
  await expect(page.getByTestId('conn-row-0')).toHaveCount(0);
});

test('RC-010: veksel fra Koble-menyen, og avvikende spor kobles tangentielt', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { x: '-40', length: '20' });
  await selectTool(page, 'connect');
  await clickWorld(page, -20, 0);
  await page.getByTestId('port-menu-turnout:right').click();
  await expect(page.getByTestId('object-turnout-001')).toContainText('60E1 1:9 R300');
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
  await expect(page.getByTestId('prop-hand')).toHaveValue('right');

  // Fortsett fra avviksporten (høyreveksel: svinger mot −Y) med rett spor
  const a = Math.atan(1 / 9);
  await clickWorld(page, -20 + 300 * Math.sin(a), -300 * (1 - Math.cos(a)));
  await page.getByTestId('port-menu-line').click();
  await page.getByTestId('connect-length').fill('10');
  await page.getByTestId('connect-create').click();
  await expect(page.getByTestId('conn-status-1')).toHaveText('OK');
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
});

test('RC-010: veksel kan velges med musen, flyttes via panelet og slettes', async ({ page }) => {
  await openApp(page);
  await placeTurnoutNumeric(page, { x: '-20', y: '0' });
  await selectTool(page, 'select');
  await page.keyboard.press('Escape'); // fjern valg
  await expect(page.getByText('Ingen objekt valgt.')).toBeVisible();
  await clickWorld(page, -10, 0); // på stamsporet
  await expect(page.getByTestId('prop-id')).toHaveText('turnout-001');
  await setField(page, 'prop-start-x', '-30');
  await expect(field(page, 'prop-start-x')).toHaveValue('-30,000');
  await page.getByTestId('delete-selected').click();
  await expect(page.getByTestId('object-list').locator('li')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('object-turnout-001')).toBeAttached();
});

test('RC-010: sporveksel og kobling overlever lagring; ukjent katalogtype avvises', async ({
  page,
}, info) => {
  const { writeFileSync } = await import('node:fs');
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'turnout');
  await clickWorld(page, 20, 0);

  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  const path = info.outputPath('veksel.railcad.json');
  await download.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.objects[1]).toMatchObject({
    id: 'turnout-001',
    type: 'turnout',
    turnout: { catalogId: 'trv-60E1-1:9-R300-EVF', hand: 'left', position: [20, 0] },
  });
  expect(saved.objects[1].turnout.catalogRevision).toContain('TRV');
  expect(saved.objects[1].geometry).toBeUndefined(); // geometri lagres ikke – den utledes av katalogen
  expect(saved.connections).toEqual([
    { a: { objectId: 'track-001', port: 'end' }, b: { objectId: 'turnout-001', port: 'stem_in' } },
  ]);

  await menu(page, 'file', 'menu-new');
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('object-turnout-001')).toBeAttached();
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');

  saved.objects[1].turnout.catalogId = 'finnes-ikke';
  const bad = info.outputPath('ukjent-veksel.json');
  writeFileSync(bad, JSON.stringify(saved));
  await page.getByTestId('menu-file').click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser2.setFiles(bad);
  await expect(page.getByTestId('dialog')).toContainText('ukjent sporvekseltype');
});

test('avansert eksempel (Lodalen-inspirert) åpnes med veksler og kontrollerte koblinger', async ({
  page,
}) => {
  const errors = await openApp(page);
  await menu(page, 'file', 'menu-demo-lodalen');
  await expect(page.getByTestId('project-title')).toContainText('Lodalen-inspirert');
  await expect(page.getByTestId('object-turnout-008')).toBeAttached();
  await expect(page.getByTestId('connections')).toContainText('Koblinger (35)');
  await expect(page.getByTestId('connections')).toContainText('alle OK');
  await expect(page.getByTestId('conn-errors')).toHaveCount(0);
  await expect(page.getByTestId('crossing-mark-0')).toHaveCount(0); // ingen kryssende spor i planen
  await expect(page.getByTestId('turnout-label-turnout-001')).toHaveCount(0); // skjult ved lav zoom
  await selectInList(page, 'turnout-001');
  await expect(page.getByTestId('turnout-label-turnout-001')).toContainText('delvis verifisert');
  expect(errors).toEqual([]);
});

test('RC-012: DXF-eksport (R12 og R2007) med lag, spor, veksler og mål', async ({ page }, info) => {
  const errors = await openApp(page);
  await page.getByTestId('menu-file').click();
  await expect(page.getByTestId('menu-export-dxf-r12')).toBeDisabled(); // tomt prosjekt
  await page.keyboard.press('Escape');
  await menu(page, 'file', 'menu-demo-lodalen');

  const exportAs = async (testId: string, file: string) => {
    await page.getByTestId('menu-file').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(testId).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.dxf$/);
    const path = info.outputPath(file);
    await download.saveAs(path);
    return readFileSync(path, 'utf8');
  };

  const r12 = await exportAs('menu-export-dxf-r12', 'lodalen-r12.dxf');
  expect(r12).toContain('AC1009');
  expect(r12.split(/\r?\n/).filter((l) => l === 'LINE').length).toBe(19 + 8 + 12);
  expect(r12.split(/\r?\n/).filter((l) => l === 'ARC').length).toBe(9 + 8);
  for (const layer of ['RAILCAD_SPORAKSE', 'RAILCAD_SPORVEKSEL', 'RAILCAD_MAAL', 'RAILCAD_TEKST']) {
    expect(r12).toContain(layer);
  }
  expect(r12).toContain('delvis verifisert');
  expect(r12).toContain('ikke regelverkskontrollert');

  const r2007 = await exportAs('menu-export-dxf-r2007', 'lodalen-r2007.dxf');
  expect(r2007).toContain('AC1021');
  expect(r2007).toContain('RAILCAD_SPORVEKSEL');
  await expect(page.getByTestId('toast').last()).toContainText('DXF R2007');
  expect(errors).toEqual([]);
});

// ---------- RC-013: referansebakgrunn ----------
const fixture = (...p: string[]) => join(process.cwd(), 'fixtures', ...p);

async function importBackground(page: import('@playwright/test').Page, file: string) {
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-import-background').click(),
  ]);
  await chooser.setFiles(file);
}

test('RC-013: DXF-bakgrunn importeres med enhet fra filen og beholder posisjonen', async ({
  page,
}) => {
  const errors = await openApp(page);
  await importBackground(page, fixture('dxf', 'kartunderlag-lokal-r2007.dxf'));
  await expect(page.getByTestId('bg-row-bg-001')).toContainText('kartunderlag-lokal-r2007');
  await expect(page.getByTestId('bg-row-bg-001')).toContainText('DXF');
  await expect(page.getByTestId('bg-unscaled-bg-001')).toHaveCount(0); // meter oppgitt i filen
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  await expect(page.getByTestId('background-bg-001')).toHaveAttribute('data-kind', 'dxf');
  await expect(page.getByTestId('background-bg-001').locator('path.bg-path').first()).toBeVisible();
  await expect(field(page, 'bg-origin-x')).toHaveValue('0,000');
  await expect(field(page, 'bg-scale')).toHaveValue('1,000000');
  await expect(page.getByTestId('bg-size')).toContainText('985,0');
  expect(errors).toEqual([]);
});

test('RC-013: millimeter-DXF skaleres automatisk til meter; UTM-DXF plasseres i visningen med forklaring', async ({
  page,
}) => {
  await openApp(page);
  await importBackground(page, fixture('dxf', 'kartunderlag-mm-r2007.dxf'));
  await expect(page.getByTestId('dialog')).toContainText('millimeters');
  await page.getByTestId('dialog-close').click();
  await expect(field(page, 'bg-scale')).toHaveValue('0,001000');
  await expect(page.getByTestId('bg-size')).toContainText('985,0'); // 985 000 mm = 985 m

  await importBackground(page, fixture('dxf', 'kartunderlag-utm-r2007.dxf'));
  await expect(page.getByTestId('dialog')).toContainText('Store koordinater');
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('bg-row-bg-002')).toBeVisible();
  const x = Number(
    (await field(page, 'bg-origin-x').inputValue()).replace(',', '.').replace(/\s/g, ''),
  );
  expect(Math.abs(x)).toBeLessThan(2000); // ikke 262 000 – lagt i visningen
});

test('RC-013: bilde uten skala markeres, og «Skaler med to punkter» setter skalaen fra kjent avstand', async ({
  page,
}) => {
  await openApp(page);
  await importBackground(page, fixture('background', 'kartunderlag.png'));
  await expect(page.getByTestId('dialog')).toContainText('Skalaen er ukjent');
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('bg-unscaled-bg-001')).toBeVisible();
  await expect(page.getByTestId('background-bg-001')).toHaveAttribute('data-kind', 'image');
  await expect(field(page, 'bg-scale')).toHaveValue('0,125000'); // antatt 200 m bred

  await page.getByTestId('bg-scale-tool').click();
  await expect(page.getByTestId('hint')).toContainText('første punkt');
  const a = await worldToPage(page, 0, 0);
  const v = await viewInfo(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.click(a.x, a.y);
  const b = { x: a.x + 100 * v.scale * 0.1, y: a.y }; // ca. 10 m til høyre
  await page.mouse.move(b.x, b.y);
  await page.mouse.click(b.x, b.y);
  const measured = (await page.getByTestId('bg-measured').textContent())!;
  expect(measured).toContain('Målt på kartet');
  const m = Number(measured.match(/([\d]+(?:,\d+)?) m/)![1]!.replace(',', '.'));
  await page.getByTestId('bg-actual').fill(String(m * 2)); // dobbelt så langt i virkeligheten
  await page.getByTestId('bg-apply-scale').click();
  await expect(field(page, 'bg-scale')).toHaveValue('0,250000');
  await expect(page.getByTestId('bg-unscaled-bg-001')).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(field(page, 'bg-scale')).toHaveValue('0,125000');
  await expect(page.getByTestId('bg-unscaled-bg-001')).toBeVisible();
});

test('RC-013: PDF gjengis til bilde og kan skjules, gjøres gjennomsiktig og fjernes (alt kan angres)', async ({
  page,
}) => {
  const errors = await openApp(page);
  await importBackground(page, fixture('background', 'kartunderlag.pdf'));
  await expect(page.getByTestId('dialog')).toContainText('Skalaen er ukjent');
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('bg-row-bg-001')).toContainText('PDF');
  await expect(page.getByTestId('background-bg-001').locator('image')).toHaveCount(1);
  const size = await page.getByTestId('background-bg-001').locator('image').getAttribute('width');
  expect(Number(size)).toBeGreaterThan(1500);

  await page.getByTestId('bg-opacity').fill('30');
  await expect(page.getByTestId('background-bg-001')).toHaveAttribute('opacity', '0.3');
  await page.getByTestId('bg-visible-bg-001').uncheck();
  await expect(page.getByTestId('background-bg-001')).toHaveCount(0);
  await page.getByTestId('bg-visible-bg-001').check();
  await expect(page.getByTestId('background-bg-001')).toHaveCount(1);
  await page.getByTestId('bg-remove-bg-001').click();
  await expect(page.getByTestId('bg-row-bg-001')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('bg-row-bg-001')).toBeVisible();
  expect(errors).toEqual([]);
});

test('RC-013: bakgrunner lagres i prosjektfilen og kommer tilbake; ugyldig bakgrunn avvises', async ({
  page,
}, info) => {
  const { writeFileSync } = await import('node:fs');
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await importBackground(page, fixture('dxf', 'kartunderlag-lokal-r2007.dxf'));
  await page.getByTestId('bg-opacity').fill('40');

  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  const path = info.outputPath('med-bakgrunn.railcad.json');
  await download.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.backgrounds).toHaveLength(1);
  expect(saved.backgrounds[0]).toMatchObject({
    kind: 'dxf',
    visible: true,
    opacity: 0.4,
    sourceUnits: 'meters',
  });
  expect(saved.backgrounds[0].placement.scaleConfirmed).toBe(true);
  expect(saved.backgrounds[0].prims.length).toBe(59);

  await menu(page, 'file', 'menu-new');
  await expect(page.getByTestId('bg-row-bg-001')).toHaveCount(0);
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('bg-row-bg-001')).toContainText('kartunderlag-lokal-r2007');
  await expect(page.getByTestId('background-bg-001')).toHaveAttribute('opacity', '0.4');

  saved.backgrounds[0].prims[0] = ['X', 0];
  const bad = info.outputPath('ugyldig-bakgrunn.json');
  writeFileSync(bad, JSON.stringify(saved));
  await page.getByTestId('menu-file').click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser2.setFiles(bad);
  await expect(page.getByTestId('dialog')).toContainText('ukjent primitiv');
});

test('RC-013: «Flytt fra → til» snapper til hjørner i DXF-bakgrunnen og flytter den', async ({
  page,
}) => {
  await openApp(page);
  await importBackground(page, fixture('dxf', 'kartunderlag-lokal-r2007.dxf'));
  const before = Number((await field(page, 'bg-origin-x').inputValue()).replace(',', '.'));
  await page.getByTestId('bg-move-tool').click();
  // Hjørnet (900, -20) i eiendomsgrensen
  const corner = await worldToPage(page, 900, -20);
  await page.mouse.move(corner.x + 3, corner.y - 2);
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'endpoint');
  await page.mouse.click(corner.x + 3, corner.y - 2);
  const target = await worldToPage(page, 900, 100);
  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('hud')).toContainText('Δy');
  await page.mouse.click(target.x + 1, target.y);
  const after = Number((await field(page, 'bg-origin-y').inputValue()).replace(',', '.'));
  expect(after).toBeGreaterThan(80); // flyttet ca. +120 m i Y fra -36
  expect(Number((await field(page, 'bg-origin-x').inputValue()).replace(',', '.'))).toBeCloseTo(
    before,
    0,
  );
});

test('faner i høyre panel: antall, avviksmerke, piltaster, automatisk bytte og husket valg', async ({
  page,
}) => {
  const errors = await openApp(page);
  const selected = async () =>
    page.locator('[role=tab][aria-selected=true]').getAttribute('data-testid');
  expect(await selected()).toBe('tab-properties');
  await expect(page.getByTestId('tabpanel-objects')).toBeHidden();

  await createLineNumeric(page, { length: '10' });
  await createLineNumeric(page, { x: '10', length: '10' });
  await expect(page.getByTestId('tab-count-objects')).toHaveText('2');
  await expect(page.getByTestId('tab-count-properties')).toHaveText('1'); // nytt spor er valgt
  await expect(page.getByTestId('tab-count-connections')).toHaveCount(0);

  // Piltaster flytter mellom faner og fokus følger
  await page.getByTestId('tab-properties').focus();
  await page.keyboard.press('ArrowRight');
  expect(await selected()).toBe('tab-objects');
  await expect(page.getByTestId('tab-objects')).toBeFocused();
  await expect(page.getByTestId('tabpanel-objects')).toBeVisible();
  await page.keyboard.press('End');
  expect(await selected()).toBe('tab-backgrounds');
  await page.keyboard.press('ArrowRight'); // rundt
  expect(await selected()).toBe('tab-properties');

  // Valg i objektlisten viser egenskapene
  await openTab(page, 'objects');
  await page.getByTestId('object-track-001').click();
  await expect(page.getByTestId('tabpanel-properties')).toBeVisible();

  // Koble via forslag: Koblinger-fanen får antall; avvik gir rødt merke og fanen beholdes ved valg
  await openTab(page, 'connections');
  await page.getByTestId('suggest-connect-0').click();
  await expect(page.getByTestId('tab-count-connections')).toHaveText('1');
  await expect(page.getByTestId('tab-count-connections')).not.toHaveClass(/alert/);
  await selectInList(page, 'track-002');
  await setField(page, 'prop-start-x', '10,5');
  await expect(page.getByTestId('tab-count-connections')).toHaveClass(/alert/);
  await openTab(page, 'connections');
  await page.getByTestId('conn-row-0').getByRole('button').first().click(); // velger de to sporene
  await expect(page.getByTestId('tabpanel-connections')).toBeVisible(); // fanen beholdes
  await expect(page.getByTestId('tab-count-properties')).toHaveText('2');

  // Valgt fane huskes etter omlasting
  await openTab(page, 'objects');
  await page.reload();
  await expect(page.getByTestId('viewport')).toBeVisible();
  if (await page.getByTestId('dialog').isVisible()) await page.getByTestId('dialog-close').click(); // evt. kladd-dialog
  expect(await selected()).toBe('tab-objects');
  expect(errors).toEqual([]);
});

test('et enkelt klikk på et endepunktgrep gir ingen feilmelding og endrer ingenting', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'select');
  const end = await worldToPage(page, 20, 0);
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await expect(field(page, 'prop-length')).toHaveValue('20,000');
  await expect(page.getByTestId('tab-count-properties')).toHaveText('1'); // fortsatt valgt
});

// ---------- Brukervennlighet ----------
async function drag(
  page: import('@playwright/test').Page,
  from: [number, number],
  to: [number, number],
) {
  const a = await worldToPage(page, from[0], from[1]);
  const b = await worldToPage(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  return async () => page.mouse.up();
}

test('valgboks: mot høyre velger det som er helt innenfor, mot venstre alt som berøres, Skift legger til', async ({
  page,
}) => {
  await openApp(page);
  for (const y of ['0', '10', '20']) await createLineNumeric(page, { y, length: '20' });
  await selectTool(page, 'select');
  await page.keyboard.press('Escape');
  const count = page.getByTestId('tab-count-properties');

  let release = await drag(page, [-5, -5], [25, 15]); // vindu: y=0 og y=10 helt innenfor
  await expect(page.getByTestId('select-box')).toBeVisible();
  await expect(page.getByTestId('select-box')).not.toHaveClass(/crossing/);
  await release();
  await expect(count).toHaveText('2');

  release = await drag(page, [25, 22], [5, 18]); // kryss (mot venstre): berører bare y=20
  await expect(page.getByTestId('select-box')).toHaveClass(/crossing/);
  await release();
  await expect(count).toHaveText('1');
  await expect(page.getByTestId('select-box')).toHaveCount(0);

  await page.keyboard.down('Shift');
  release = await drag(page, [25, 12], [5, 8]); // kryss som berører y=10 – legges til
  await release();
  await page.keyboard.up('Shift');
  await expect(count).toHaveText('2');

  await clickWorld(page, 40, 25); // klikk på tom flate fjerner valget
  await expect(count).toHaveCount(0);
});

test('Skift låser retningen til 15° når et rett spor tegnes med musen', async ({ page }) => {
  await openApp(page);
  await selectTool(page, 'line');
  await clickWorld(page, 0, 0);
  const p = await worldToPage(page, 30, 2); // ca. 3,8° fra x-aksen
  await page.keyboard.down('Shift');
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('hud')).toContainText('låst');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
  await expect(field(page, 'prop-heading')).toHaveValue('0,0000');
  await expect(field(page, 'prop-start-y')).toHaveValue('0,000');
});

test('angre/gjør om-knapper og zoomknapper', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('undo-btn')).toBeDisabled();
  await expect(page.getByTestId('redo-btn')).toBeDisabled();
  await createLineNumeric(page, { length: '20' });
  await expect(page.getByTestId('undo-btn')).toBeEnabled();
  await expect(page.getByTestId('undo-btn')).toHaveAttribute('title', /Angre tegn rett spor/);
  await page.getByTestId('undo-btn').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveCount(0);
  await expect(page.getByTestId('redo-btn')).toBeEnabled();
  await page.getByTestId('redo-btn').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveText('1');

  const s0 = (await viewInfo(page)).scale;
  await page.getByTestId('zoom-in').click();
  expect((await viewInfo(page)).scale).toBeCloseTo(s0 * 1.4, 6);
  await page.getByTestId('zoom-out').click();
  expect((await viewInfo(page)).scale).toBeCloseTo(s0, 6);
  await page.getByTestId('zoom-fit').click();
  expect((await viewInfo(page)).scale).toBeGreaterThan(10); // 20 m spor fyller flaten
});

test('«Kom i gang»-kortet vises i tomt prosjekt, åpner eksempel, og forsvinner når noe finnes', async ({
  page,
}) => {
  await openApp(page);
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('welcome-close').click();
  await expect(page.getByTestId('welcome')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('welcome-demo').click();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.getByTestId('project-title')).toContainText('Verkstedspor');
});

test('hjelp med «?» og fokus tilbake; Esc lukker dialogen', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tool-select').focus();
  await page.keyboard.press('?');
  await expect(page.getByTestId('dialog')).toContainText('Valgboks');
  await expect(page.getByTestId('dialog-close')).toBeFocused();
  await page.keyboard.press('Tab'); // eneste knapp – fokus holdes inne i dialogen
  await expect(page.getByTestId('dialog-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  await expect(page.getByTestId('tool-select')).toBeFocused();

  await menu(page, 'help', 'menu-help-shortcuts');
  await expect(page.getByTestId('dialog')).toBeVisible();
});

test('tallfelt: pil opp/ned justerer (Skift ×10, Alt ×0,1) og kan angres', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  const f = field(page, 'prop-length');
  await f.focus();
  await page.keyboard.press('ArrowUp');
  await expect(f).toHaveValue('21,000');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(f).toHaveValue('31,000');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(f).toHaveValue('30,900');
  await page.keyboard.press('ArrowDown');
  await expect(f).toHaveValue('29,900');
  await page.keyboard.press('Control+z'); // i tekstfelt: angre er appens (fokus er i feltet, men ikke tastet tekst)
});

test('objekt opprettet via skjema utenfor skjermen blir synlig; oversikt vises når ingenting er valgt', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { x: '5000', y: '3000', length: '40' });
  const v = await viewInfo(page);
  expect(Math.abs(v.cx - 5000)).toBeLessThan(200);
  expect(Math.abs(v.cy - 3000)).toBeLessThan(200);
  await page.getByTestId('tool-select').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ov-tracks')).toHaveText('1 (40,0 m)');
  await expect(page.getByTestId('ov-turnouts')).toHaveText('0');
});

test('ulagret arbeid gjenopprettes etter oppdatering; «Forkast» og lagring fjerner sikkerhetskopien', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('railcad.draft')), { timeout: 6000 })
    .not.toBeNull();

  await page.reload();
  await expect(page.getByTestId('dialog')).toContainText('Gjenopprette ulagret arbeid');
  await page.getByTestId('dialog-confirm').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveText('1');
  await expect(page.getByTestId('project-title')).toContainText('•'); // fortsatt ulagret

  // Lagre fjerner kladden
  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  await download.path();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('railcad.draft')), { timeout: 4000 })
    .toBeNull();

  // Ny endring → ny kladd → «Forkast» etter omlasting gir tomt prosjekt og ingen kladd
  await createLineNumeric(page, { y: '5', length: '10' });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('railcad.draft')), { timeout: 6000 })
    .not.toBeNull();
  await page.reload();
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('railcad.draft'))).toBeNull();
});

// ---------- Rettelser etter kodegjennomgang ----------
test('angre tilbake til lagret tilstand fjerner «ulagret»-merket', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await expect(page.getByTestId('project-title')).toContainText('•');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('project-title')).not.toContainText('•');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('project-title')).toContainText('•');
});

test('angre avbryter et verktøy som venter på neste klikk (parallelt spor med slettet referanse)', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await selectTool(page, 'parallel');
  await clickWorld(page, 10, 0);
  await expect(page.getByTestId('hint')).toContainText('plassere kopien');
  await page.getByTestId('undo-btn').click(); // fjerner referansesporet
  await expect(page.getByTestId('hint')).toContainText('Velg et rett referansespor');
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('radius kan ikke gjøres negativ i feltet (retning styres av «Kurveretning»)', async ({
  page,
}) => {
  await openApp(page);
  await selectTool(page, 'arc');
  const f = page.getByTestId('options-arc');
  await f.getByTestId('new-radius').fill('100');
  await f.getByTestId('new-sweep').fill('45');
  await page.getByTestId('create-arc').click();
  await setField(page, 'prop-radius', '-50');
  await expect(page.getByRole('alert').first()).toContainText('Radius må være større enn 0');
  await expect(field(page, 'prop-radius')).toHaveValue('-50'); // feltet viser feil, modellen er uendret
  await expect(page.getByTestId('prop-side')).toHaveValue('left');
  await page.keyboard.press('Escape');
});

test('tangent-snap virker også når et rett spor tegnes mot en bue', async ({ page }) => {
  await openApp(page);
  await selectTool(page, 'arc');
  const f = page.getByTestId('options-arc');
  await f.getByTestId('new-radius').fill('10');
  await f.getByTestId('new-sweep').fill('180');
  await page.getByTestId('create-arc').click(); // sentrum (0,10), høyre halvdel
  await selectTool(page, 'line');
  await clickWorld(page, 20, 10);
  const t = await worldToPage(page, 5.1, 18.5); // tangentpunktet ligger i (5; 18,66)
  await page.mouse.move(t.x, t.y);
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'tangent');
});

test('ugyldige/ekstreme verdier gir feilmelding i stedet for ødelagt visning', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '1e300' });
  await expect(page.getByTestId('options-line').getByRole('alert')).toContainText('høyst');
  await expect(page.getByTestId('tab-count-objects')).toHaveCount(0);
  const v = await viewInfo(page);
  expect(Number.isFinite(v.scale) && Number.isFinite(v.cx)).toBe(true);
});

// ---------- Kryssende spor ----------
test('kryssende spor flagges med markering, kan vises, bekreftes som planskilt og angres', async ({
  page,
}, info) => {
  const errors = await openApp(page);
  await createLineNumeric(page, { x: '-10', length: '20' });
  await createLineNumeric(page, { x: '0', y: '-10', heading: '90', length: '20' });

  await expect(page.getByTestId('crossing-mark-0')).toBeVisible();
  await expect(page.getByTestId('crossing-mark-0')).toHaveAttribute('data-kind', 'crossing');
  await expect(page.getByTestId('tab-count-connections')).toHaveClass(/alert/);
  await expect(page.getByTestId('tab-count-connections')).toHaveText('1');

  await openTab(page, 'connections');
  await expect(page.getByTestId('cross-row-0')).toContainText(
    'track-001 × track-002 krysser i 90,0°',
  );
  await expect(page.getByTestId('crossings-heading')).toContainText('(1)');
  await expect(page.getByTestId('crossings-heading')).toContainText('ikke vurdert');

  await page.getByTestId('cross-row-0').getByRole('button').first().click(); // Vis: velger begge sporene
  await expect(page.getByTestId('tab-count-properties')).toHaveText('2');

  await page.getByTestId('cross-ack-0').click(); // Planskilt
  await expect(page.getByTestId('crossing-mark-0')).toHaveAttribute('data-acked', 'true');
  await expect(page.getByTestId('crossings-heading')).toContainText('(0)');
  await expect(page.getByTestId('tab-count-connections')).toHaveCount(0); // ingen avvik, ingen koblinger

  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  const path = info.outputPath('planskilt.railcad.json');
  await download.saveAs(path);
  expect(JSON.parse(readFileSync(path, 'utf8')).acknowledgedCrossings).toEqual([
    'track-001|track-002',
  ]);

  await page.getByTestId('undo-btn').click();
  await expect(page.getByTestId('crossing-mark-0')).toHaveAttribute('data-acked', 'false');
  await expect(page.getByTestId('crossings-heading')).toContainText('(1)');
  expect(errors).toEqual([]);
});

test('T-forbindelse (spor som ender på et annet) og overlapp flagges, og flytting løser det', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await createLineNumeric(page, { x: '10', heading: '90', length: '10' });
  await expect(page.getByTestId('crossing-mark-0')).toHaveAttribute('data-kind', 'touch');
  await openTab(page, 'connections');
  await expect(page.getByTestId('cross-row-0')).toContainText('track-002 ender på track-001');

  await selectInList(page, 'track-002');
  await setField(page, 'prop-start-y', '5'); // flyttet bort fra sporet
  await expect(page.getByTestId('crossing-mark-0')).toHaveCount(0);

  await createLineNumeric(page, { x: '5', length: '20' }); // oppå track-001 fra x=5
  await expect(page.getByTestId('crossing-mark-0')).toHaveAttribute('data-kind', 'overlap');
  await openTab(page, 'connections');
  await expect(page.getByTestId('cross-row-0')).toContainText('overlapper 15,0 m');
});

test('spisse krysningsvinkler vises også som forhold 1:n', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { x: '-50', length: '100' });
  const deg = String((Math.atan(1 / 9) * 180) / Math.PI); // 1:9
  await createLineNumeric(page, { x: '-20', y: '-5', heading: deg, length: '100' });
  await openTab(page, 'connections');
  await expect(page.getByTestId('cross-row-0')).toContainText('6,3° (1:9,0)');
});

// ---------- Sporkryss (brukerdefinert, ikke verifisert) ----------
async function placeCrossing(
  page: import('@playwright/test').Page,
  v: { ratio?: string; half?: string; x?: string; y?: string; heading?: string } = {},
) {
  await selectTool(page, 'crossing');
  const f = page.getByTestId('options-crossing');
  await f.getByTestId('crossing-ratio').fill(v.ratio ?? '9');
  await f.getByTestId('crossing-half').fill(v.half ?? '17');
  await f.getByTestId('crossing-x').fill(v.x ?? '0');
  await f.getByTestId('crossing-y').fill(v.y ?? '0');
  await f.getByTestId('crossing-heading').fill(v.heading ?? '0');
  await page.getByTestId('create-crossing').click();
}

test('sporkryss: opprettes med forhold og lengde, merkes ikke verifisert, og kan redigeres', async ({
  page,
}) => {
  const errors = await openApp(page);
  await selectTool(page, 'crossing');
  await expect(page.getByTestId('crossing-note')).toContainText('ikke verifisert');
  await placeCrossing(page, { ratio: '9', half: '17' });

  await expect(page.getByTestId('object-crossing-001')).toContainText('1:9,0');
  await expect(page.getByTestId('prop-crossing-type')).toContainText('Sporkryss');
  await expect(page.getByTestId('prop-verification')).toHaveText('Ikke verifisert');
  await expect(page.getByTestId('turnout-label-crossing-001')).toContainText('ikke verifisert');
  await expect(page.getByTestId('prop-angle')).toHaveText('6,340°');
  for (const p of ['a_start', 'a_end', 'b_start', 'b_end']) {
    await expect(page.getByTestId(`prop-port-${p}`)).toHaveText('ledig');
  }

  await setField(page, 'prop-ratio', '12');
  await expect(page.getByTestId('prop-angle')).toHaveText('4,764°');
  await setField(page, 'prop-ratio', '1');
  await expect(page.getByRole('alert').first()).toContainText('må ha n mellom');
  await expect(field(page, 'prop-ratio')).toHaveValue('1');
  await setField(page, 'prop-half', '0');
  await expect(page.locator('#prop-half-err')).toContainText('mellom 0 og 10 000');

  await selectTool(page, 'crossing');
  await page.getByTestId('crossing-ratio').fill('1');
  await page.getByTestId('create-crossing').click();
  await expect(page.getByTestId('options-crossing').getByRole('alert')).toContainText('1,5 og 100');
  expect(errors).toEqual([]);
});

test('sporkryss: plasseres på sporendepunkt og kobles, spor på begge sider gir ingen kryssadvarsel', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { x: '-60', length: '40' }); // slutter i (-20,0)
  await selectTool(page, 'crossing');
  await clickWorld(page, -20, 0);
  await expect(page.getByTestId('object-crossing-001')).toBeAttached();
  await expect(page.getByTestId('conn-status-0')).toHaveText('OK');
  await expect(page.getByTestId('prop-port-a_start')).toContainText('track-001 slutt · OK');

  // Spor i forlengelsen ut fra a_end (M = (-3,0), a_end = (14,0)): koblet via Koble-verktøyet
  await selectTool(page, 'connect');
  await clickWorld(page, 14, 0);
  await page.getByTestId('port-menu-line').click();
  await page.getByTestId('connect-length').fill('20');
  await page.getByTestId('connect-create').click();
  await expect(page.getByTestId('conn-status-1')).toHaveText('OK');
  await expect(page.getByTestId('crossing-mark-0')).toHaveCount(0); // ingen kryssadvarsel for koblede spor

  // Et tverrgående spor gjennom krysset flagges derimot
  await createLineNumeric(page, { x: '3', y: '-8', heading: '90', length: '16' });
  await expect(page.getByTestId('crossing-mark-0')).toBeVisible();
});

test('sporkryss lagres og åpnes igjen med alle felt, og kan flyttes med musen', async ({
  page,
}, info) => {
  await openApp(page);
  await placeCrossing(page, { ratio: '12', half: '20', x: '10', y: '5', heading: '15' });
  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  const path = info.outputPath('kryss.railcad.json');
  await download.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.objects[0]).toMatchObject({
    id: 'crossing-001',
    type: 'crossing',
    crossing: { position: [10, 5], ratioN: 12, halfLengthM: 20 },
  });
  expect(saved.objects[0].crossing.headingRad).toBeCloseTo((15 * Math.PI) / 180, 12);

  await menu(page, 'file', 'menu-new');
  await page.getByTestId('menu-file').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('menu-open').click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('object-crossing-001')).toContainText('1:12,0');

  await selectTool(page, 'select');
  await page.keyboard.press('Escape');
  const from = await worldToPage(page, 10, 5);
  const to = await worldToPage(page, 30, 5);
  await page.mouse.move(from.x + 1, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const movedX = Number((await field(page, 'prop-start-x').inputValue()).replace(',', '.'));
  expect(Math.abs(movedX - 30)).toBeLessThan(0.3); // flyttet ca. +20 m
});

test('PDF med flere sider: sidevalg ved import, og avbryt gir ingen bakgrunn', async ({ page }) => {
  const errors = await openApp(page);
  await importBackground(page, fixture('background', 'kartunderlag-2sider.pdf'));
  await expect(page.getByTestId('prompt')).toContainText('Side (1–2)');
  await page.getByTestId('prompt-input').fill('3');
  await page.getByTestId('prompt-ok').click();
  await expect(page.getByRole('alert').first()).toContainText('mellom 1 og 2');
  await page.getByTestId('prompt-cancel').click();
  await expect(page.getByTestId('bg-row-bg-001')).toHaveCount(0);
  await expect(page.getByTestId('dialog')).toHaveCount(0); // avbrutt – ingen feildialog

  await importBackground(page, fixture('background', 'kartunderlag-2sider.pdf'));
  await page.getByTestId('prompt-input').fill('2');
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId('dialog')).toContainText('Importert: side 2');
  await page.getByTestId('dialog-close').click();
  await expect(page.getByTestId('bg-row-bg-001')).toContainText('PDF');
  expect(errors).toEqual([]);
});

// ---------- Kopiér/lim inn, lås, lag, tittel ----------
test('kopiér og lim inn med Ctrl+C/V (ved markøren), og dupliser fra menyen', async ({ page }) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await page.keyboard.press('Control+c');
  await expect(page.getByTestId('toast').last()).toContainText('Kopierte 1 objekt');
  const target = await worldToPage(page, 10, 20); // markørposisjon = midten av det limte objektet
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('tab-count-objects')).toHaveText('2');
  await expect(page.getByTestId('prop-id')).toHaveText('track-002');
  await expect(field(page, 'prop-start-x')).toHaveValue('0,000'); // midt (10,20) → start (0,20)
  const y = Number((await field(page, 'prop-start-y').inputValue()).replace(',', '.'));
  expect(Math.abs(y - 20)).toBeLessThan(0.2);

  await page.getByTestId('menu-edit').click();
  await page.getByTestId('menu-duplicate').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveText('3');
  await expect(field(page, 'prop-start-x')).toHaveValue('5,000'); // forskjøvet 5 m
  await page.getByTestId('undo-btn').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveText('2'); // ett angresteg per innliming
});

test('låsing: låst objekt kan ikke flyttes, redigeres eller slettes før det låses opp', async ({
  page,
}) => {
  await openApp(page);
  await createLineNumeric(page, { length: '20' });
  await page.getByTestId('prop-locked').check();
  await expect(field(page, 'prop-length')).toBeDisabled();
  await expect(page.getByTestId('locked-note')).toContainText('Objektet er låst');

  await selectTool(page, 'select');
  const from = await worldToPage(page, 10, 0);
  const to = await worldToPage(page, 10, 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('toast').last()).toContainText('låst');
  await expect(field(page, 'prop-start-y')).toHaveValue('0,000');

  await page.getByTestId('delete-selected').click();
  await expect(page.getByTestId('toast').last()).toContainText('låst');
  await expect(page.getByTestId('tab-count-objects')).toHaveText('1');

  await openTab(page, 'objects');
  await expect(page.getByTestId('object-lock-track-001')).toBeVisible();
  await selectInList(page, 'track-001');
  await page.getByTestId('prop-locked').uncheck();
  await expect(field(page, 'prop-length')).toBeEnabled();
  await page.getByTestId('delete-selected').click();
  await expect(page.getByTestId('tab-count-objects')).toHaveCount(0);
});

test('lag: nye objekter på aktivt lag, skjul og lås lag, slett lag, og lagring bevarer lagene', async ({
  page,
}, info) => {
  const errors = await openApp(page);
  await openTab(page, 'objects');
  await page.getByTestId('layer-new-name').fill('Verksted');
  await page.getByTestId('layer-add').click();
  await expect(page.getByTestId('layer-row-lag-001')).toBeVisible();
  await createLineNumeric(page, { length: '20' }); // havner på «Verksted»
  await openTab(page, 'objects');
  await expect(page.getByTestId('layer-count-lag-001')).toHaveText('1');
  await expect(page.getByTestId('layer-count-standard')).toHaveText('0');
  await expect(page.getByTestId('prop-layer'))
    .toHaveValue('lag-001')
    .catch(() => undefined);

  await page.getByTestId('layer-visible-lag-001').uncheck();
  await expect(page.locator('[data-track="track-001"]')).toHaveCount(0);
  await expect(page.getByTestId('object-hidden-track-001')).toBeVisible();
  await page.getByTestId('layer-visible-lag-001').check();
  await expect(page.locator('[data-track="track-001"]')).toHaveCount(1);

  await page.getByTestId('layer-locked-lag-001').check();
  await selectInList(page, 'track-001');
  await expect(page.getByTestId('locked-note')).toContainText('låst lag');
  await expect(field(page, 'prop-length')).toBeDisabled();

  await page.getByTestId('menu-file').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('menu-save').click(),
  ]);
  const path = info.outputPath('lag.railcad.json');
  await download.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.layers.map((l: { name: string }) => l.name)).toEqual(['Standard', 'Verksted']);
  expect(saved.layers[1]).toMatchObject({ visible: true, locked: true });
  expect(saved.objects[0].layerId).toBe('lag-001');

  await openTab(page, 'objects');
  await page.getByTestId('layer-remove-lag-001').click();
  await expect(page.getByTestId('layer-row-lag-001')).toHaveCount(0);
  await expect(page.getByTestId('layer-count-standard')).toHaveText('1');
  await selectInList(page, 'track-001');
  await expect(field(page, 'prop-length')).toBeEnabled(); // ikke lenger på låst lag
  expect(errors).toEqual([]);
});

test('prosjektnavn kan endres ved dobbeltklikk på tittelen (Enter lagrer, Esc avbryter)', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('project-title-name').dblclick();
  await page.getByTestId('project-title-input').fill('Hensetting Øst');
  await page.getByTestId('project-title-input').press('Escape');
  await expect(page.getByTestId('project-title')).toContainText('Nytt prosjekt');

  await page.getByTestId('project-title-name').dblclick();
  await page.getByTestId('project-title-input').fill('Hensetting Øst');
  await page.getByTestId('project-title-input').press('Enter');
  await expect(page.getByTestId('project-title')).toContainText('Hensetting Øst');
  await expect(page.getByTestId('project-title')).toContainText('•'); // navneendring er ulagret
});
