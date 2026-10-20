import { expect, type Page } from '@playwright/test';

export interface ViewInfo {
  scale: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export async function openApp(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/');
  await expect(page.getByTestId('viewport')).toBeVisible();
  return errors;
}

export async function viewInfo(page: Page): Promise<ViewInfo> {
  const vp = page.getByTestId('viewport');
  const num = async (a: string) => Number(await vp.getAttribute(a));
  return {
    scale: await num('data-scale'), cx: await num('data-cx'), cy: await num('data-cy'),
    width: await num('data-width'), height: await num('data-height'),
  };
}

/** Verdenskoordinat → siderelative piksler (samme transformasjon som appen bruker). */
export async function worldToPage(page: Page, x: number, y: number) {
  const v = await viewInfo(page);
  const box = (await page.getByTestId('viewport').boundingBox())!;
  return {
    x: box.x + v.width / 2 + (x - v.cx) * v.scale,
    y: box.y + v.height / 2 - (y - v.cy) * v.scale,
  };
}

export async function clickWorld(page: Page, x: number, y: number) {
  const p = await worldToPage(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

export async function selectTool(page: Page, id: string) {
  await page.getByTestId(`tool-${id}`).click();
}

/** Oppretter et rett spor via skjemaet i verktøylinjen over tegneflaten. */
export async function createLineNumeric(
  page: Page,
  v: { x?: string; y?: string; heading?: string; length: string },
) {
  await selectTool(page, 'line');
  const form = page.getByTestId('options-line');
  await form.getByTestId('new-x').fill(v.x ?? '0');
  await form.getByTestId('new-y').fill(v.y ?? '0');
  await form.getByTestId('new-heading').fill(v.heading ?? '0');
  await form.getByTestId('new-length').fill(v.length);
  await page.getByTestId('create-line').click();
}

export async function menu(page: Page, menuId: string, itemTestId: string) {
  await page.getByTestId(`menu-${menuId}`).click();
  await page.getByTestId(itemTestId).click();
}

export const field = (page: Page, id: string) => page.getByTestId(id);

export async function setField(page: Page, id: string, value: string) {
  const f = field(page, id);
  await f.fill(value);
  await f.press('Enter');
}
