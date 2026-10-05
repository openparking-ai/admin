# Open Parking AI — admin

The garage owner's screens for [Open Parking AI](https://github.com/openparking-ai):
one owner, at a computer, in English or Spanish, by day or by night.

This repository is the interface only. It holds no data of its own; everything it
shows comes from the platform, through the platform's own doors: the owner signs
in, picks a garage, and sees its lanes and the cars inside.

## Running it

Node 20 or newer.

```sh
npm ci
npm run dev        # http://localhost:5173, with /api sent to the platform
npm run build      # the site, in dist/, ready to serve from any folder
```

`npm run dev` sends `/api` to the platform at `OPENPARKING_PLATFORM`
(default `http://127.0.0.1:3000`). The built site holds no address: it always asks
its own origin.

## Serving it

**The site and the platform's `/api` must be served from the same origin.** The
platform's sign-in cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api`
and has no `Domain`, and the platform allows no other origin, so a site served from
anywhere else cannot sign in. Serve `dist/` and send `/api/*` to the platform from
one host name.

`index.html` carries a page policy (`Content-Security-Policy` meta): everything from
the page's own origin, nothing inline. A meta tag cannot carry everything, so the
server in front must add these response headers:

| Header | Value | Why a meta tag cannot |
|---|---|---|
| `Content-Security-Policy` | the policy in `index.html`, plus `frame-ancestors 'none'` | `frame-ancestors` is ignored in a meta tag |
| `X-Frame-Options` | `DENY` | for browsers that do not read `frame-ancestors` |
| `X-Content-Type-Options` | `nosniff` | response header only |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | response header only |
| `Referrer-Policy` | `no-referrer` | the meta covers the page; the header covers every file |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | response header only |
| `Cross-Origin-Opener-Policy` | `same-origin` | response header only |
| `Cache-Control` on `index.html` | `no-store` | so a signed-out page is never served from a cache |

The build publishes no source maps.

## What it holds

- **Signing in**: email and password. The session is the platform's `HttpOnly`
  cookie; the page never reads it, and whether someone is signed in is the
  platform's answer to `GET /api/v1/auth/me`. One message for every refusal, one
  when the session has ended, one when the platform cannot be reached. The
  password field is emptied after every attempt. On sign-out, and on any 401 from
  any request, everything held about the owner is dropped and the sign-in screen
  shown. `src/SignIn.jsx`, `src/owner.js`.
- **One place talks to the platform**, `src/api.js`. A body that is not JSON, a
  dropped connection or a code it does not know each become words from the
  dictionaries; no code, status number or error text reaches a screen.
- **Home, Lanes and equipment, Cars inside** show the chosen garage's lanes (in or
  out, and when each lane computer was last heard from) and the cars inside, with
  every time in the garage's own time zone. Every line is true in every state the
  platform can return: "No lane computer yet" only for a lane that never had one;
  a lane whose computers all had their access cancelled says so, and when; "No
  cars confirmed inside", never "No cars inside", when some were let in that the
  lane could not confirm (`src/lanes.js`, `src/inside.js`,
  `test/words-in-every-state.test.js`). Cars inside lists every car a lane let
  in that has not left, some of them not confirmed, so no line there or in its
  Quick Find entry says every car listed is parked or came in: its time column is
  "Let in" (`npm run check-browser` reads every line with a car not confirmed on
  it). A lane computer counts as not heard
  from after `LANE_QUIET_MINUTES` (`src/settings.js`, 5). Both lists print from
  the browser's own print, without the frame.
- **Download Excel, Download PDF, Print**, beside each list. Each click reads the
  list from the platform again, shows that answer on screen, and makes the file
  (or the printed page) from it, stamped with that moment in the garage's time
  (`src/ListActions.jsx`). The files are made in the browser and ask nothing of
  anywhere: `src/files/` (one description of the file, `model.js`, drawn by
  `excel.js` and `pdf.js`), loaded only when a Download is clicked. In both: the
  garage, the list, when it was downloaded, "Times are {zone}." and what each
  column means. The Excel file holds the garage's clock in real date-time cells,
  every name, plate and ticket as text, and no formula; the PDF is Letter size in
  DM Sans (static Regular and Bold made from the variable font, in
  `src/files/fonts/` with the licence). Both files carry the same text of a
  stored name (`src/files/text.js`): tab, line breaks and every other Unicode
  space become a plain space; controls, format characters, noncharacters and
  lone surrogates are left out of both (the Mac's Numbers cuts a cell at the
  first one), and the screen says hidden characters were left out of the file.
  The PDF prints only characters its font has a real shape for, and names any
  letter it could not draw. The checks build their odd-text cases from
  Unicode's own tables (`scripts/files/unicode-cases.py`, Unicode 15.0.0) and
  read every Excel file back with openpyxl, LibreOffice (in CI) and, on a Mac,
  Numbers (`SPREADSHEET_READERS`). The file is in the language on screen. A
  read that fails says so and makes no file; signed out meanwhile, no file is
  saved. Lanes and equipment's file has one row per lane computer, its state
  worded with a time ("Working, last heard from 10:41 AM"), never "a minute ago".
- **Every field says what it is.** Anything a person reads, fills or uses has one
  short sentence under its name (at most 15 words, both languages), always
  visible: each form field, each figure on Home, each column of a list (printed
  with it), the Language and Look choosers, the garage chooser, and Quick Find
  (inside its box, under the typing line). Each description is true in every
  state its field can show. Fields are named through `src/FieldName.jsx`;
  `npm run check-descriptions` fails a field without one, and that is the rule
  for every later screen.

- **Pages**: Home, Garages, Lanes and equipment, Card readers, Rates, Taxes and fees,
  Getting paid, Cars inside. `src/pages.js`. A page with nothing on it yet says
  so under its line.
- **Two languages**, English and Spanish. Every word on the screen is in
  `src/i18n/en.js` and `src/i18n/es.js`, and nowhere else. **English unless the
  owner chose Spanish**: the browser's own language decides nothing. Signed in,
  the owner's profile on the platform holds the choice (`PUT /api/v1/auth/language`),
  so it follows them to any computer, shown from the first frame; a choice made on
  the sign-in screen is kept on the profile of whoever signs in. This computer
  keeps a copy, so the next sign-in screen speaks it. If keeping it on the profile
  fails, the screens still change for this visit and one sentence says it was not
  kept. `src/App.jsx`, `src/i18n/index.js`.
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
| Quick Find finds every page in both languages; day/night/auto; language; what Home and the lists say is true in every state | `npm test` |
| The page never touches the session; it asks only its own origin, by relative address | `npm run check-page-stays-home` |
| Home says only what it shows (no breakdown the platform does not return) | `npm run check-home-claims` |
| Every field has a short description in both languages, at most 15 words | `npm run check-descriptions` |
| No source maps in the built site | `npm run build && npm run check-no-source-maps` |
| The downloaded files hold the list: built from `test/files-fixtures.js` with this computer in another zone, read back with Python openpyxl and pypdf (`scripts/files/readers.txt`, pinned by hash): row for row, garage time across a clock change, text stays text and 0 formulas, every character, long lists and long names, the file name, every column described; odd stored text (every control character, direction marks, zero-width characters, right-to-left and Chinese scripts, emoji, a name of only spaces, names of up to 100,000 characters) through every file, each made within 5 seconds, everything left out said | `npm run check-files` |
| Neither file maker is in the first page's JavaScript | `npm run build && npm run check-first-load` |
| Download Excel, Download PDF and Print in a browser, against the stand-in, both languages, day and night, every file read back: the file is the list on screen, garage time, a fresh read for each click, a failed read and a 401 make no file, one click one file, the page policy unchanged and never broken; the same odd stored text through the screen, Print, both files, the file names and the notice, nothing in a name turning the words around it | `npm run build && npm run check-downloads` |
| The built site in a browser, signed in against a stand-in platform (`test/stub-platform.js`, never built into the site): sign-in, refusals, every failure, sign-out and any 401 clearing everything, garage time with the browser in another zone, print, English by default, the language kept on the profile across browsers and chosen at sign-in, a failed save said plainly, every description visible under its name on screen and in print (the choosers' and Quick Find's too), a lane whose only computer was cancelled, none confirmed inside, the page policy enforced; no request leaves it | `npm run build && npm run check-browser` |

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE). Contributions need the CLA — see
[CONTRIBUTING.md](CONTRIBUTING.md). The fonts keep their own licence, the SIL
Open Font License 1.1 (`src/fonts/*-OFL.txt`, `src/files/fonts/DMSans-OFL.txt`).
The file makers use jsPDF and fflate, both MIT.

---

Built by 72 Knots Method by 72Knots.ai
