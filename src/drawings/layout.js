// The pieces a drawing sheet is made of, before any file is made.
//
// A sheet is a list of plain items (lines, boxes, shapes, text) placed in
// points on an 11 x 17 in page, landscape, the size construction sets are
// printed on in the United States. The PDF (src/drawings/pdf.js) and the
// printed page (src/drawings/Sheets.jsx) draw the same items, so the two can
// never say different things. Text is laid out with the PDF font's own
// widths (`fonts.measure`), and only characters that font draws reach a
// sheet (`fonts.clean`).

export const PAGE = { width: 1224, height: 792 }; // 17 x 11 in, landscape, in points

export const COLOR = {
  ink: '#0e0c09',
  soft: '#4a463f',
  rule: '#cfc7b6',
  gold: '#8a6f3e',
  loop: '#1f5fa8',
  conduit: '#3d7a4a',
  confirm: '#b3401c',
  power: '#6b3fa0',
  car: '#ece5d6',
  view: '#f3ecdc',
  shade: '#f2ede3',
  paper: '#fffefb',
};

export const SIZE = { small: 6.5, text: 7.5, heading: 8, value: 9.5, title: 15 };
const LEAD = 1.32;

/** Margins of the sheet: its frame, the title at the top, the title block at the bottom. */
export const FRAME = { inset: 18, top: 58, left: 30, right: PAGE.width - 30, bottom: 712 };

/** Words broken into lines no wider than `width`; a word longer than a line is broken where it must be. */
export function wrapText(text, width, measure) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const tried = line ? `${line} ${word}` : word;
    if (measure(tried) <= width) {
      line = tried;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    let rest = word;
    while (measure(rest) > width) {
      const chars = [...rest];
      let take = chars.length - 1;
      while (take > 1 && measure(chars.slice(0, take).join('')) > width) take -= 1;
      lines.push(chars.slice(0, take).join(''));
      rest = chars.slice(take).join('');
    }
    line = rest;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

/** A blank sheet to draw on. */
export function createSheet(fonts) {
  const items = [];
  const add = (item) => {
    items.push(item);
    return item;
  };
  const stroke = (o) => (o.stroke === undefined ? COLOR.ink : o.stroke);
  const s = {
    items,
    line: (x1, y1, x2, y2, o = {}) => add({ t: 'line', x1, y1, x2, y2, color: o.color ?? COLOR.ink, width: o.width ?? 0.75, dash: o.dash ?? null }),
    rect: (x, y, w, h, o = {}) => add({ t: 'rect', x, y, w, h, stroke: stroke(o), fill: o.fill ?? null, width: o.width ?? 0.75, dash: o.dash ?? null, radius: o.radius ?? 0, role: o.role ?? null }),
    poly: (points, o = {}) => add({ t: 'poly', points, closed: o.closed ?? false, stroke: stroke(o), fill: o.fill ?? null, width: o.width ?? 0.75, dash: o.dash ?? null }),
    circle: (cx, cy, r, o = {}) => add({ t: 'circle', cx, cy, r, stroke: stroke(o), fill: o.fill ?? null, width: o.width ?? 0.75 }),
    /** Text; `kind` is 'words' (the dictionaries' words and the table's numbers), 'data' (what the garage stored) or 'link'. */
    text: (x, y, text, o = {}) =>
      add({ t: 'text', x, y, text: fonts.clean(text), size: o.size ?? SIZE.text, bold: o.bold ?? false, color: o.color ?? COLOR.ink, anchor: o.anchor ?? 'start', kind: o.kind ?? 'words' }),
    measure: (text, size = SIZE.text, bold = false) => fonts.measure(fonts.clean(text), size, bold),
    // Broken at plain spaces only, so a number (written with no-break spaces) stays whole; each line is cleaned when drawn.
    wrap: (text, width, size = SIZE.text, bold = false) => wrapText(String(text), width, (x) => fonts.measure(fonts.clean(x), size, bold)),
    /** A line with a filled head at its end, and at its start too if `both`. */
    arrow(x1, y1, x2, y2, o = {}) {
      s.line(x1, y1, x2, y2, o);
      const head = (ax, ay, bx, by) => {
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        const h = 4.5;
        const w = 1.8;
        s.poly([[bx, by], [bx - ux * h - uy * w, by - uy * h + ux * w], [bx - ux * h + uy * w, by - uy * h - ux * w]], { closed: true, stroke: null, fill: o.color ?? COLOR.ink });
      };
      head(x1, y1, x2, y2);
      if (o.both) head(x2, y2, x1, y1);
    },
  };
  return s;
}

/** The same sheet, drawn at `k` points a unit from (ox, oy): for a drawing laid out in its own units. Text keeps its point size. */
export function scaled(s, ox, oy, k) {
  const X = (x) => ox + x * k;
  const Y = (y) => oy + y * k;
  const w = (o) => ({ ...o, width: (o.width ?? 1) * k });
  return {
    X,
    Y,
    k,
    line: (x1, y1, x2, y2, o = {}) => s.line(X(x1), Y(y1), X(x2), Y(y2), w(o)),
    rect: (x, y, ww, h, o = {}) => s.rect(X(x), Y(y), ww * k, h * k, { ...w(o), radius: (o.radius ?? 0) * k }),
    poly: (points, o = {}) => s.poly(points.map(([x, y]) => [X(x), Y(y)]), w(o)),
    path: (d, o = {}) => s.poly(d.map(([x, y]) => [X(x), Y(y)]), w(o)),
    circle: (cx, cy, r, o = {}) => s.circle(X(cx), Y(cy), r * k, w(o)),
    text: (x, y, text, o = {}) => s.text(X(x), Y(y), text, o),
    arrow: (x1, y1, x2, y2, o = {}) => s.arrow(X(x1), Y(y1), X(x2), Y(y2), w(o)),
    measure: s.measure,
  };
}

/**
 * Text set in a column from (x, y), `width` wide, going down: headings,
 * paragraphs, bullets and tables. `y` is where the column has got to.
 */
export function column(s, x, y, width) {
  let at = y;
  const lines = (list, o, indent = 0) => {
    for (const line of list) {
      at += o.size * LEAD;
      s.text(x + indent, at, line, o);
    }
  };
  const c = {
    get y() {
      return at;
    },
    gap(n) {
      at += n;
      return c;
    },
    heading(text) {
      at += 6;
      lines(s.wrap(text.toLocaleUpperCase(), width, SIZE.heading, true), { size: SIZE.heading, bold: true, color: COLOR.soft });
      at += 3;
      return c;
    },
    para(text, o = {}) {
      const size = o.size ?? SIZE.text;
      lines(s.wrap(text, width, size, o.bold), { size, bold: o.bold ?? false, color: o.color ?? COLOR.ink, kind: o.kind });
      at += o.after ?? 3;
      return c;
    },
    bullets(list, o = {}) {
      for (const text of list) {
        const top = at;
        lines(s.wrap(text, width - 10, SIZE.text), { size: SIZE.text, color: COLOR.ink }, 10);
        s.circle(x + 3, top + SIZE.text * LEAD - SIZE.text * 0.32, 1.3, { stroke: null, fill: o.color ?? COLOR.ink });
        at += 3.5;
      }
      return c;
    },
    /** cols: [{ name, share }]; rows: [[cell]], a cell being text or { text, color, bold, kind }. */
    table(cols, rows) {
      const xs = [];
      let left = x;
      for (const col of cols) {
        xs.push(left);
        left += col.share * width;
      }
      const pad = 4;
      const cellOf = (cell) => (typeof cell === 'string' ? { text: cell } : cell);
      // Headings.
      const heads = cols.map((col) => s.wrap(col.name.toLocaleUpperCase(), col.share * width - pad, SIZE.small, true));
      const top = at;
      heads.forEach((head, i) => head.forEach((line, j) => s.text(xs[i], top + (j + 1) * SIZE.small * LEAD, line, { size: SIZE.small, bold: true, color: COLOR.soft })));
      at = top + Math.max(...heads.map((h) => h.length)) * SIZE.small * LEAD + 3;
      s.line(x, at, x + width, at, { color: COLOR.ink, width: 0.75 });
      for (const row of rows) {
        const cells = row.map((cell, i) => {
          const c2 = cellOf(cell);
          return { ...c2, lines: c2.text ? s.wrap(c2.text, cols[i].share * width - pad, SIZE.text, c2.bold) : [] };
        });
        const rowTop = at;
        cells.forEach((cell, i) =>
          cell.lines.forEach((line, j) => s.text(xs[i], rowTop + (j + 1) * SIZE.text * LEAD, line, { size: SIZE.text, bold: cell.bold ?? false, color: cell.color ?? COLOR.ink, kind: cell.kind })),
        );
        at = rowTop + Math.max(1, ...cells.map((cell) => cell.lines.length)) * SIZE.text * LEAD + 3.5;
        s.line(x, at, x + width, at, { color: COLOR.rule, width: 0.5 });
      }
      at += 3;
      return c;
    },
  };
  return c;
}
