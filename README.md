# Open Parking AI — admin

The garage owner's screens for [Open Parking AI](https://github.com/openparking-ai):
one owner, at a computer, in English or Spanish, by day or by night.

This repository is the interface only. It holds no data of its own; everything it
will show comes from the platform, through the platform's own doors. This first
version is the frame: the pages, the two languages, the day/night switch and
Quick Find. It reads nothing from the platform yet.

## Running it

Node 20 or newer.

```sh
npm ci
npm run dev        # http://localhost:5173
npm run build      # the site, in dist/, ready to serve from any folder
```

## What it holds

- **Pages**: Home, Garages, Lanes and devices, Card readers, Rates, Taxes and fees,
  Getting paid, Cars inside. `src/pages.js`.
- **Two languages**, English and Spanish. Every word on the screen is in
  `src/i18n/en.js` and `src/i18n/es.js`, and nowhere else. The first visit follows
  the browser's language; a choice is kept for the next visit.
- **Day, night or auto.** Auto follows the computer's own setting and changes the
  moment it does. `src/theme.js`.
- **Quick Find** — Cmd/Ctrl+K anywhere, or the search pill. Finds pages and
  settings, in the language on screen. `src/search.js`, `src/QuickFind.jsx`.
- **The look** continues the Open Parking AI site: its mark, its wordmark, its
  colours (ink, paper, gold) and its three typefaces — DM Serif Display for the
  wordmark and page titles, DM Sans for text, JetBrains Mono for figures and small
  labels. All three are under the SIL Open Font License 1.1 and ship in
  `src/fonts/` with their licence files, so a computer on a garage's own network
  needs nothing from outside it.

## Checks

Each one is shown failing before its result is read — `npm run fail-controls`
plants one break per check in a scratch copy and requires the check to fail and
name it.

| Check | Command |
|---|---|
| No technical words, in either language | `npm run check-plain-words` |
| Nothing readable outside the dictionaries | `npm run check-readable-text` |
| The two languages match | `npm run check-languages-match` |
| Text against background is at least 4.5 : 1, day and night | `npm run check-contrast` |
| No colour from the first look (all 25 of `d4c9301`), source and built | `npm run check-old-colours` |
| Quick Find finds every page in both languages; day/night/auto; language | `npm test` |
| The built site in a browser; no request leaves it | `npm run build && npm run check-browser` |

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE). Contributions need the CLA — see
[CONTRIBUTING.md](CONTRIBUTING.md). The fonts keep their own licence, the SIL
Open Font License 1.1 (`src/fonts/*-OFL.txt`).

---

Built by 72 Knots Method by 72Knots.ai
