// Going to a page by the side menu (src/menu.js), as a person does: a page inside the
// Setup group is reached by opening the group first when it is closed.
export async function goNav(page, href) {
  const link = page.locator(`.nav-item[href="${href}"]`);
  if ((await link.count()) === 0 || !(await link.first().isVisible())) {
    const group = page.locator('[data-own-group="true"] > .nav-group-name');
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
  }
  await page.click(`.nav-item[href="${href}"]`);
}

/** Whether the side menu has an entry for `href`, opening the Setup group to look when it is closed. */
export async function navHas(page, href) {
  if ((await page.locator(`.nav-item[href="${href}"]`).count()) > 0) return true;
  const group = page.locator('[data-own-group="true"] > .nav-group-name');
  if ((await group.count()) && (await group.getAttribute('aria-expanded')) !== 'true') await group.click();
  return (await page.locator(`.nav-item[href="${href}"]`).count()) > 0;
}
