/* global document, window */
// U7a: the language and the look are chosen on the Settings page (and the
// sign-in screen), no longer at the top of every page. For a check that was
// on a page: go to Settings, choose, wait for the choice to hold, and come
// back to the page it was on, which reads itself again on arrival.

export async function chooseOnSettings(page, control, value) {
  const was = await page.evaluate(() => window.location.hash);
  await page.click('.nav-item[href="#/settings"]');
  await page.click(`[data-control="${control}"] [data-value="${value}"]`);
  await page.waitForFunction(
    ([c, v]) => document.querySelector(`[data-control="${c}"] [data-value="${v}"]`)?.getAttribute('aria-checked') === 'true',
    [control, value],
  );
  if (was !== '#/settings') await page.evaluate((hash) => (window.location.hash = hash || '#/'), was);
}
