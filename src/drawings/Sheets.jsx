import { PAGE } from './layout.js';

// The sheets for the printed page: the very items the PDF draws
// (src/drawings/pdf.js), as one SVG a sheet, each on a page of its own
// (styles.css, `@page drawings`).

const ANCHOR = { start: 'start', middle: 'middle', end: 'end' };

function Item({ item }) {
  const dash = item.dash ? item.dash.join(' ') : undefined;
  switch (item.t) {
    case 'line':
      return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={item.width} strokeDasharray={dash} />;
    case 'rect':
      return (
        <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={item.radius || undefined} fill={item.fill ?? 'none'} stroke={item.stroke ?? 'none'} strokeWidth={item.width} strokeDasharray={dash} />
      );
    case 'poly': {
      const points = item.points.map((p) => p.join(',')).join(' ');
      const Shape = item.closed ? 'polygon' : 'polyline';
      return <Shape points={points} fill={item.fill ?? 'none'} stroke={item.stroke ?? 'none'} strokeWidth={item.width} strokeDasharray={dash} />;
    }
    case 'circle':
      return <circle cx={item.cx} cy={item.cy} r={item.r} fill={item.fill ?? 'none'} stroke={item.stroke ?? 'none'} strokeWidth={item.width} />;
    case 'text':
      return (
        <text x={item.x} y={item.y} fontSize={item.size} fontWeight={item.bold ? 700 : 400} fill={item.color} textAnchor={ANCHOR[item.anchor]} xmlSpace="preserve">
          {item.text}
        </text>
      );
    default:
      return null;
  }
}

export default function Sheets({ sheets }) {
  return (
    <div className="drawings-print" data-sheets={sheets.length}>
      {sheets.map((sheet, i) => (
        <svg key={i} className="drawing-sheet" viewBox={`0 0 ${PAGE.width} ${PAGE.height}`} role="img" aria-label={sheet.title} data-sheet={i + 1}>
          {sheet.items.map((item, j) => (
            <Item key={j} item={item} />
          ))}
        </svg>
      ))}
    </div>
  );
}
