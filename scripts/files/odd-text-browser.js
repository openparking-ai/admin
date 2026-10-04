/* global document, window, getComputedStyle */
// Odd stored text in a real browser, for scripts/check-downloads.js: the
// built site, signed in against the stand-in platform, page policy enforced.
//
//   - the class (scripts/files/odd-text.js): every text the lists show x every
//     case, through the screen, Print, Download Excel, Download PDF, the file
//     names and the notice under the buttons, in English and Spanish, both
//     lists; every file within FILE_SECONDS of the click;
//   - the gate's set: "Gx<char>H2" lanes, "Exit<TAB>2 West", "TAB<TAB>999",
//     the check-10 garage, garage names of 3,000 and 8,000 characters;
//   - F1 on screen: nothing in a stored name turns the words around it: every
//     sentence and cell holding one reads in order, left to right, and the
//     notice names no invisible character.

import { join } from 'node:path';
import { FONT, cellOf, classFiles, judge, listOf } from './odd-text-files.js';
import { CASES, FILE_SECONDS, invisibleIn, pdfExpect, plain } from './odd-text.js';
import { readBack } from './read-back.js';

const garageId = (n) => `f3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * In the page: does `element` read in order? Each <bdi> is one piece (a name
 * may run right to left inside itself); every other word is a piece. Each
 * piece must start to the right of where the one before started, or on a
 * later line. (Where it ended is no guide: a mark drawn round a letter can
 * reach back past its own start.) A direction mark that escaped a name would draw the words after it
 * backwards, and this says where.
 */
function readsInOrder(element) {
  const pieces = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && child.tagName === 'BDI') {
        const rects = [...child.getClientRects()].filter((r) => r.width > 0);
        if (rects.length) pieces.push({ what: child.textContent.slice(0, 24), start: rects[0], end: rects[rects.length - 1] });
      } else if (child.nodeType === 1) {
        if (getComputedStyle(child).display !== 'none') visit(child);
      } else if (child.nodeType === 3) {
        for (const m of child.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(child, m.index);
          range.setEnd(child, m.index + m[0].length);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          if (rects.length) pieces.push({ what: m[0], start: rects[0], end: rects[rects.length - 1] });
        }
      }
    }
  };
  visit(element);
  for (let i = 1; i < pieces.length; i += 1) {
    const a = pieces[i - 1].end;
    const b = pieces[i].start;
    const sameLine = Math.abs(a.top - b.top) < Math.min(a.height, b.height) / 2;
    if ((sameLine && b.left < a.left) || (!sameLine && b.top < a.top)) return `"${pieces[i - 1].what}" then "${pieces[i].what}" drawn out of order`;
  }
  return null;
}

/**
 * In the page: a file name laid out as a computer shows it, in a left-to-right
 * line. The list, the date, the time, the garage's name and the extension
 * must be drawn in that order: a name in a right-to-left script must not carry
 * the date along with it (U3 fix round: chat put the garage's name last).
 */
function fileNameInOrder(name) {
  const line = document.createElement('div');
  line.dir = 'ltr';
  line.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;font:16px sans-serif';
  line.textContent = name;
  document.body.append(line);
  const text = line.firstChild;
  const box = (from, to) => {
    const range = document.createRange();
    range.setStart(text, from);
    range.setEnd(text, to);
    return range.getBoundingClientRect();
  };
  const m = /(\d{4}-\d\d-\d\d) (\d{4})( - )?(.*)(\.[a-z]+)$/.exec(name);
  const dateAt = m.index;
  const pieces = [['list', box(0, Math.min(4, dateAt))], ['date', box(dateAt, dateAt + 10)], ['time', box(dateAt + 11, dateAt + 15)]];
  const garageAt = dateAt + 15 + (m[3] ?? '').length;
  if (m[4]) pieces.push(['garage name', box(garageAt, garageAt + m[4].length)]);
  pieces.push(['extension', box(name.length - m[5].length, name.length)]);
  line.remove();
  for (let i = 1; i < pieces.length; i += 1) if (pieces[i][1].left < pieces[i - 1][1].right - 1) return `${pieces[i][0]} drawn before the ${pieces[i - 1][0]}`;
  return null;
}

/** In the page: what the notice under the buttons says. */
function noticeNow() {
  const box = document.querySelector('.list-actions');
  const letters = [...box.querySelectorAll('[data-notice="missing-letters"] [data-letter]')];
  return {
    text: [...box.querySelectorAll('[data-notice]')].map((p) => p.textContent).join(' '),
    letters: letters.map((b) => b.textContent.replace(/^◌/, '')),
    isolated: letters.every((b) => b.tagName === 'BDI'),
    more: Number(box.querySelector('[data-notice="missing-letters"] [data-more]')?.dataset.more ?? 0),
    hidden: Boolean(box.querySelector('[data-notice="hidden-characters"]')),
    cut: Boolean(box.querySelector('[data-notice="cut-at-limit"]')),
  };
}

export async function oddTextWalk({ browser, base, A, dir, cell, check, policyBroken }) {
  const readAt = Date.now();
  const files = []; // { list, language, f, pdf, xlsx, told }
  const gate = [];
  let n = 100;

  // ── The garages: one per class file, one per gate case ────────────────────
  const garage = (name, inside, lanes) => {
    n += 1;
    const g = { id: garageId(n), name, timezone: 'America/New_York', currency: 'USD', live: true };
    A.garages.push(g);
    A.open[g.id] = inside;
    A.lanes[g.id] = lanes;
    return g;
  };
  const kinds = classFiles('inside').map((fi, i) => {
    const fl = classFiles('lanes')[i];
    return { kind: fi.kind, inside: fi, lanes: fl, g: garage(fi.garage, listOf('inside', fi.rows, readAt).sessions, listOf('lanes', fl.rows, readAt)) };
  });
  const gateChars = { TAB: '\t', VT: '\v', FF: '\f', DEL: '\x7f', NUL: '\0', BEL: '\x07', LF: '\n', CR: '\r', NBSP: ' ', 'U+2028': ' ', ZWJ: '‍', 'U+202E': '‮', '東': '東', '🚗': '🚗' };
  const gateGarages = Object.entries(gateChars).map(([label, ch]) => ({ label, lane: `Gx${ch}H2`, g: garage(`Gate ${label}`, [], listOf('lanes', [{ name: `Gx${ch}H2`, computer: 'Computadora' }], readAt)) }));
  const check10 = garage('A/B:C*D?"E<F>|G\u0007‮H', listOf('inside', [{ plate: 'TAB\t999', region: null, ticket: null, lane: 'Entrada' }], readAt).sessions, listOf('lanes', [{ name: 'Exit\t2 West', computer: 'Computadora' }], readAt));
  const longGarages = [3000, 8000].map((len) => ({ len, g: garage('Ñ'.repeat(len), listOf('inside', [{ plate: 'AB1234', region: null, ticket: null, lane: 'Entrada' }], readAt).sessions, []) }));

  // ── The page ──────────────────────────────────────────────────────────────
  async function openAt(g, language) {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo', acceptDownloads: true, viewport: { width: 1360, height: 860 } });
    context.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) policyBroken.push(m.text());
    });
    await context.addInitScript(() => {
      window.__printed = 0;
      window.print = () => {
        window.__printed += 1;
      };
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.fill('input[name="email"]', A.email);
    await page.fill('input[name="password"]', A.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`.garage-choice[data-garage="${g.id}"]`);
    const picker = await page.evaluate((id) => {
      const b = document.querySelector(`.garage-choice[data-garage="${id}"] .garage-choice-name`);
      return { text: b.textContent, isolated: b.firstElementChild?.tagName === 'BDI' && b.firstElementChild.textContent === b.textContent };
    }, g.id);
    await page.click(`.garage-choice[data-garage="${g.id}"]`);
    await page.waitForSelector('.page-title');
    await page.click(`[data-control="language"] [data-value="${language}"]`);
    return { context, page, picker };
  }
  const goTo = async (page, list) => {
    await page.click(`.nav-item[href="#/${list === 'inside' ? 'cars-inside' : 'lanes'}"]`);
    await page.waitForSelector(`[data-list="${list}"] [data-action="download-excel"]`);
  };

  /** Click Download; the file, and how long from the click until the browser had it. */
  async function download(page, list, what, tag) {
    await page.waitForTimeout(400);
    const path = join(dir, `odd-${tag}.${what === 'excel' ? 'xlsx' : 'pdf'}`);
    const started = Date.now();
    const got = page.waitForEvent('download', { timeout: FILE_SECONDS * 1000 + 1000 }).then(
      (d) => d,
      () => null,
    );
    await page.click(`[data-list="${list}"] [data-action="download-${what}"]`);
    const d = await got;
    const ms = Date.now() - started;
    if (!d) return { path, timedOut: true, ms };
    await d.saveAs(path);
    await page.waitForFunction(() => !document.querySelector('.list-actions[aria-busy="true"]'), undefined, { timeout: 30000 });
    return { path, ms, timedOut: ms > FILE_SECONDS * 1000, name: d.suggestedFilename() };
  }

  /** What the screen shows of the list, and whether each stored text reads in order inside its sentence. */
  const screenOf = (page, list) =>
    page.evaluate(
      ({ list, order }) => {
        const inOrder = new Function(`return (${order})`)();
        const cells = [...document.querySelectorAll(`[data-list="${list}"] tbody tr`)].map((tr) => {
          const td = [...tr.cells];
          const isolated = (el) => Boolean(el?.querySelector('bdi')) || el?.textContent === '–';
          if (list === 'inside')
            return { plate: td[0].textContent, ticket: td[1].textContent, lane: td[3].textContent, isolated: { plate: isolated(td[0]), ticket: isolated(td[1]), lane: isolated(td[3]) }, order: { plate: inOrder(td[0]), ticket: inOrder(td[1]), lane: inOrder(td[3]) } };
          const li = td[2].querySelector('[data-device]');
          return { name: td[0].textContent, computer: li?.querySelector('.device-name').textContent, isolated: { name: isolated(td[0]), computer: isolated(li?.querySelector('.device-name')) }, order: { name: inOrder(td[0]), computer: li ? inOrder(li) : 'no lane computer shown' } };
        });
        const current = document.querySelector('.garage-current');
        return { cells, garage: current?.textContent, garageIsolated: Boolean(current?.querySelector('bdi')) };
      },
      { list, order: readsInOrder.toString() },
    );

  const told = async (page) => page.evaluate(noticeNow);
  const noticeOrder = (page) =>
    page.evaluate((order) => {
      const inOrder = new Function(`return (${order})`)();
      return [...document.querySelectorAll('.list-actions [data-notice]')].map((p) => inOrder(p)).filter(Boolean);
    }, readsInOrder.toString());

  // ── The class ─────────────────────────────────────────────────────────────
  for (const language of ['en', 'es']) {
    for (const k of kinds) {
      const { context, page, picker } = await openAt(k.g, language);
      try {
        for (const list of ['inside', 'lanes']) {
          // A page that never gave a file may not answer again: the next list starts on a new page.
          if (files.some((x) => x.language === language && x.f.kind === k.kind && (x.pdf.timedOut || x.xlsx.timedOut))) {
            check(false, `odd text: ${k.kind} (${language}): the ${list} list was not reached, the page stopped answering after a file was not made`);
            continue;
          }
          const f = k[list];
          const tag = `${list}-${language}-${k.kind.replace(/\W+/g, '')}`;
          await goTo(page, list);
          const screen = await screenOf(page, list);
          const xlsx = await download(page, list, 'excel', tag);
          const afterExcel = xlsx.timedOut ? null : await told(page);
          const pdf = xlsx.timedOut ? { timedOut: true, ms: 0 } : await download(page, list, 'pdf', tag);
          const afterPdf = pdf.timedOut ? null : await told(page);
          const order = pdf.timedOut ? [] : await noticeOrder(page);
          // Print: read again, then the print view.
          let printed = null;
          if (!pdf.timedOut) {
            await page.click(`[data-list="${list}"] [data-action="print"]`);
            await page.waitForFunction(() => window.__printed > 0 && !document.querySelector('.list-actions[aria-busy="true"]'), undefined, { timeout: 10000 });
            await page.emulateMedia({ media: 'print' });
            printed = await page.evaluate((l) => {
              const head = document.querySelector('.print-garage');
              const table = document.querySelector(`[data-list="${l}"] table`);
              return { garage: head?.textContent, isolated: Boolean(head?.querySelector('bdi')), table: table && getComputedStyle(table).display !== 'none' ? table.textContent : null };
            }, list);
            await page.emulateMedia({ media: 'screen' });
            await page.evaluate(() => {
              window.__printed = 0;
            });
          }
          files.push({ list, language, f, pdf, xlsx, told: { letters: afterPdf?.letters ?? null, more: afterPdf?.more ?? 0, hidden: afterPdf?.hidden, cut: afterExcel?.cut } });

          // The screen, the print view and the notice, for every text and case.
          const texts = list === 'inside' ? [['plate', 0, 'plate'], ['plate region', 0, 'plate'], ['ticket', 1, 'ticket'], ['lane name', 3, 'lane']] : [['lane name', 0, 'name'], ['lane computer name', 2, 'computer']];
          const ids = f.kind === 'cases' ? CASES.map((c) => c.id) : [f.kind];
          f.rows.forEach((row, i) => {
            const s = screen.cells[i] ?? {};
            for (const [text, column, key] of texts) {
              const want = cellOf(list, column, row);
              const ok = s[key] === want && s.isolated?.[key];
              cell(text, 'screen', ids[i], Boolean(ok), ok ? 'whole, kept apart' : `${tag}: ${s[key] === want ? '' : `shows ${JSON.stringify(String(s[key]).slice(0, 30))} `}${s.isolated?.[key] ? '' : 'not kept apart'}`);
              // The sentence or cell it sits in reads in order: for a lane computer, its name and how it is doing.
              const wrongOrder = s.order?.[key];
              cell(text, 'screen reads in order', ids[i], !wrongOrder, wrongOrder ? `${tag}: ${wrongOrder}` : 'in order');
              const inPrint = printed?.table?.includes(want) && printed.isolated;
              cell(text, 'print', ids[i], Boolean(inPrint), inPrint ? 'whole' : `${tag}: not whole in the print view`);
            }
          });
          const names = [];
          for (const [format, made] of [['pdf', pdf], ['xlsx', xlsx]]) names.push([format, made, made.name ? await page.evaluate(fileNameInOrder, made.name) : 'no file']);
          for (const id of ids) {
            const g = screen.garage === f.garage && screen.garageIsolated && picker.text === f.garage && picker.isolated;
            cell('garage name', 'screen', id, g, g ? 'whole, kept apart (top bar, garage list)' : `${tag}: top bar ${JSON.stringify(String(screen.garage).slice(0, 30))}, list ${JSON.stringify(picker.text.slice(0, 30))}, kept apart ${screen.garageIsolated}/${picker.isolated}`);
            const p = printed?.garage === f.garage && printed.isolated;
            cell('garage name', 'print', id, Boolean(p), p ? 'whole, kept apart' : `${tag}: print head ${JSON.stringify(String(printed?.garage).slice(0, 30))}`);
            for (const [format, made, wrong] of names) cell('garage name', `file name (${format}) as shown`, id, !wrong, wrong ? `${tag}: ${JSON.stringify(made.name ?? '').slice(0, 80)}: ${wrong}` : 'list, date, time, name, in order');
            const shown = afterPdf ? invisibleIn(afterPdf.text).length === 0 && afterPdf.isolated && order.length === 0 : false;
            for (const text of ['garage name', ...texts.map((x) => x[0])]) cell(text, 'notice (screen) words', id, shown, shown ? 'names no invisible character; reads in order' : `${tag}: invisible in the notice ${afterPdf ? invisibleIn(afterPdf.text).length : '?'}; letters kept apart ${afterPdf?.isolated}; ${order.join('; ')}`);
          }
        }
      } catch (error) {
        check(false, `odd text: ${k.kind} (${language}): the walk stopped: ${error.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  }

  // ── The gate's set ────────────────────────────────────────────────────────
  for (const [i, gg] of gateGarages.entries()) {
    const { context, page } = await openAt(gg.g, 'en');
    try {
      await goTo(page, 'lanes');
      const screen = await screenOf(page, 'lanes');
      const pdf = await download(page, 'lanes', 'pdf', `gate-${i + 1}`);
      gate.push({ label: `a lane named "Gx<${gg.label}>H2"`, want: plain(pdfExpect(gg.lane, FONT).text), pdf, screenOk: screen.cells[0]?.name === gg.lane });
    } catch (error) {
      check(false, `F2 a lane named "Gx<${gg.label}>H2": the walk stopped: ${error.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await openAt(check10, 'en');
    try {
      await goTo(page, 'lanes');
      const lanes = await screenOf(page, 'lanes');
      const pdf = await download(page, 'lanes', 'pdf', 'gate-check10-lanes');
      const notice = pdf.timedOut ? null : await told(page);
      const order = pdf.timedOut ? ['no file'] : await noticeOrder(page);
      gate.push({ label: 'a lane named "Exit<TAB>2 West"', want: 'Exit 2 West', pdf, screenOk: lanes.cells[0]?.name === 'Exit\t2 West' });
      gate.push({ label: 'the check-10 garage', want: 'A/B:C*D?"E<F>|GH', pdf, screenOk: lanes.garage === check10.name });
      check(
        notice && notice.hidden && notice.letters.length === 0 && invisibleIn(notice.text).length === 0 && order.length === 0,
        `F1 on screen: the check-10 garage's notice names no invisible character and reads left to right ("${notice ? plain(notice.text) : 'no notice'}"${order.length ? `; ${order.join('; ')}` : ''}${notice ? `; invisible in it: ${invisibleIn(notice.text).length}` : ''})`,
      );
      await goTo(page, 'inside');
      const inside = await screenOf(page, 'inside');
      const pdf2 = await download(page, 'inside', 'pdf', 'gate-check10-inside');
      gate.push({ label: 'a plate "TAB<TAB>999"', want: 'TAB 999', pdf: pdf2, screenOk: inside.cells[0]?.plate === 'TAB\t999' });
    } catch (error) {
      check(false, `F1/F2 the check-10 garage: the walk stopped: ${error.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
  for (const lg of longGarages) {
    const { context, page } = await openAt(lg.g, 'en');
    try {
      await goTo(page, 'inside');
      const pdf = await download(page, 'inside', 'pdf', `gate-long-${lg.len}`);
      check(!pdf.timedOut, `F3 a garage name of ${lg.len.toLocaleString('en-US')} characters: Download PDF gives a file within ${FILE_SECONDS} s of the click (${pdf.timedOut ? `none in ${FILE_SECONDS} s` : `${pdf.ms} ms`})`);
    } catch (error) {
      check(false, `F3 a garage name of ${lg.len.toLocaleString('en-US')} characters: the walk stopped: ${error.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }

  // ── Reading every file back ───────────────────────────────────────────────
  const made = [...files.flatMap((x) => [x.pdf, x.xlsx]), ...gate.map((x) => x.pdf)].filter((m) => !m.timedOut && m.path);
  const back = readBack([...new Set(made.map((m) => m.path))]);
  for (const x of files) judge({ ...x, back, cell, noticeOutput: 'notice (screen)' });
  for (const x of gate) {
    const text = x.pdf.timedOut ? '' : plain(back[x.pdf.path].pages.map((p) => p.text).join('\n'));
    const lost = !text.includes(x.want);
    check(!lost && x.screenOk, `F2 ${x.label}: the PDF prints "${x.want}"${lost ? ` (it has "${(text.match(/(Gx|Exit|TAB|A\/B)\S*/g) ?? []).join(' ')}": the text after the odd character was lost)` : ''}; the screen shows it whole: ${x.screenOk}`);
  }
}

