# Open Parking AI — admin

The garage owner's screens for [Open Parking AI](https://github.com/openparking-ai):
one owner, at a computer, in English or Spanish, by day or by night.

This repository is the interface only. It holds no data of its own; everything it
shows comes from the platform, through the platform's own doors: the owner signs
in, sees their garages, and for each its lanes and the cars inside.

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
- **Home** lists the owner's garages first (one garage is a list of one), each
  with one line: how many of its lanes are working and how many cars are inside.
  Choosing one shows that garage below the list, as Home showed it before (U7a).
- **Home, Lanes and equipment, Garage View** (once "Cars inside"; its old
  address still opens it) show the chosen garage's lanes (in or
  out, and when each lane computer was last heard from) and the cars inside, with
  every time in the garage's own time zone. Every line is true in every state the
  platform can return: "No lane computer yet" only for a lane that never had one;
  a lane whose computers all had their access cancelled says so, and when; "No
  cars confirmed inside", never "No cars inside", when some were let in that the
  lane could not confirm (`src/lanes.js`, `src/inside.js`,
  `test/words-in-every-state.test.js`). Garage View lists every car a lane let
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
- **Lists** (U7a) are compact: small type, tight rows, a date and time on one
  line. A list of more than 20 shows 20 at a time, with Previous, Next and where
  you are ("21–40 of 312"); the rows off the page stay in the page, left out
  only on screen, so Print holds the whole list, and every file is made from the
  list as read, never the page on screen. The change log is read whole, every
  page the platform gives (`src/parts.jsx` `usePaging`, `Pager`). A list with
  nothing in it shows no Download and no Print.
- **Less on each page** (U7a): at most one short notice at the top; a form stays
  closed behind its button ("Add a person", "Add a lane", "Add a message", "Change
  taxes", "Enter the address", "Set up getting paid", the drivers question) until
  pressed, and a note about how a form works is in that form.
- **Confirm email** (U7a): every email typed on these screens to be kept (adding a
  person to tell, or changing their address) has a Confirm email under it, and is
  not saved, said in plain words, until the two are the same. The sign-in
  screen's email signs in and keeps nothing.
- **Every field says what it is.** Anything a person reads, fills or uses has one
  short sentence under its name (at most 15 words, both languages), always
  visible: each form field, each figure on Home, each column of a list (printed
  with it), the Language and Look choosers, the garage chooser, and Quick Find
  (inside its box, under the typing line). Each description is true in every
  state its field can show. Fields are named through `src/FieldName.jsx`;
  `npm run check-descriptions` fails a field without one, and that is the rule
  for every later screen.

- **Installer drawings, one sheet at a time** (U7b): each sheet in the list has
  its own View (that sheet over the page, drawn by the same code the print
  uses, with a Close), Download PDF and Print. Each reads the lanes again,
  makes the whole set and gives that one sheet of it -- its "1 of 11" and all
  -- its file named for the sheet and its lane. The whole set's Download PDF
  and Print stay above the list. `src/DrawingsPage.jsx`, `src/drawings/pdf.js`.
- **Who gets which alert** pages at 20 rows like every list (U7b), a row being
  one person under one alert; an alert running on to the next page is named
  again at its top. The print holds every row.
- **Garages** (U7c): the account's garages, 20 a page, each with its name,
  its time zone and money in words ("Eastern — New York", "US dollars"),
  open or not yet, and how many of its Setup steps are done, as the Setup
  page counts them; pressing one chooses it and opens its Setup. **Add a
  garage**, closed until pressed, asks three things -- the name, the time
  zone (the United States' first, then every other the browser can name,
  each with its place) and the money it charges in (US dollars first) --
  with nothing picked for the owner; then shows the three again with "These
  can't be changed after the garage is created", and Create garage sends
  `POST /garages` with exactly `name`, `timezone` and `currency`, once,
  however quickly it is pressed twice. A blank field sends nothing and says
  which; a refusal is one plain sentence and changes nothing. The new garage
  is chosen and its Setup opened; what to do with an unknown plate and the
  kind of space keep the platform's defaults, and drivers without a pass
  stays a Setup step. An account with no garage is offered Add a garage on
  every page. `src/GaragesPage.jsx`, `src/garages.js`.
- **The refused attempts' count follows the choices** (U7c): with some
  ticked it says how many of them are shown ("24 of 120 refused attempts");
  with none, or only sorted, how many in all.
- **Accept your invite** (U7d-2): sign-up is by invitation only, and the
  emailed link is `<site>/#invite=<token>`. The token is read from the
  address's fragment as the page starts -- or as a link is opened into a page
  already open -- and the address is put back without it at once, so it is
  not left in the history, a bookmark or a picture of the address bar; it is
  sent only in a POST body (`POST /auth/invite/status`, `/auth/invite/accept`),
  never in an address or a query (`src/links.js`). The screen says what the
  link is, in a plain sentence. Ready: the email it was sent to (read only), a
  new password typed twice (at least 12 characters, said plainly) and the
  language, the invite's own to start with; nothing is sent until the two
  match and meet the rule. Accepted, the owner is signed in on the Garages
  page, ready to add a garage. Used, ended, replaced by a newer invite, or not
  an invite: its sentence and the one thing to do, and no form.
  `src/InviteScreen.jsx`.
- **Forgot your password?** (U7d-2), a small link on the sign-in screen: the
  email, then the same sentence whatever email was typed, so the screen
  never says whether an account exists (`POST /auth/forgot`). The link it
  sends is `<site>/#reset=<token>`, taken out of the address the same way:
  **Choose a new password** asks for it twice; changed, the sign-in screen
  says so, and that every computer was signed out. A link already used,
  ended, replaced or not one says so plainly and offers "Forgot your
  password?" again. `src/ForgotScreen.jsx`, `src/ResetScreen.jsx`.
- **Time zones** (U7d-2): the United States' group is every zone tzdata's
  `zone1970.tab` gives the United States, then Puerto Rico, Guam and American
  Samoa. A browser lists some zones by names tzdata has since changed
  ("Asia/Calcutta", "Europe/Kiev", "America/Indianapolis"); each is shown, and
  sent, by today's name (Kolkata, Kyiv, Indiana's Indianapolis), once
  (`ZONE_RENAMED` in `src/garages.js`). On Setup, a garage's details say they
  were set when it was created and can't be changed.
- **Pages**: Home, Setup, Garages, Lanes and equipment, Installer drawings, Card
  readers, Rates, Taxes and fees, Getting paid, Garage View, Alerts, Change log,
  Settings. `src/pages.js`. A page with nothing on it yet says so under its line.
- **Setup** is the garage's checklist, as the platform works it out
  (`GET /garages/:id/setup`): each step's name and what it is, done or not yet,
  its facts in plain words and where it is done (the page that does it) -- or
  "This can't be set from here yet." Nothing here decides a step (`src/setup.js` only words it). The
  question "Does this garage take drivers without a pass?" is answered there;
  once answered it can be changed, never taken back to unanswered.
- **Lanes and equipment** also sets lanes up: add, rename, remove (a used lane is
  kept, with the reason), connect a lane computer or cancel its access, close
  (full, or closed to everyone, with a message picked from English and Spanish
  samples or typed) and reopen. A way out is closed to everyone only: full is a
  way in's reason. The message is shown on the lane's screen, so a character
  the screen cannot show (its list is the platform's, `screen.characters` on
  the lanes read) is named as it is typed and the lane is not closed with it,
  and a preview shows it in capitals and in lines as the screen does. The last
  open lane of a direction warns and closes only on a second press. Every
  confirmation is on the page. A new lane computer's connection code is shown
  once, with a copy button, and kept nowhere: not in browser storage, the
  address, a log line or a file; it goes when the panel closes.
- **What the lane screens show**, under the lanes: the owner's messages, each
  with the lanes it shows at and an optional start and end in the garage's own
  time, added, changed and removed on the page; and, per lane, a switch to show
  the price, which the lane works out itself. The same character rule and
  preview as a closing message.
- **Taxes and fees** (`GET`/`POST /garages/:id/tax-sets`): the list in force now,
  the ones that start later and the ones before it, each with when it starts in
  the garage's own time, and each line's name, percent ("18.5%") and rounding, in
  order; "This garage hasn't said yet." with no list, "This garage charges no
  tax." for a list with no lines. "Change taxes" starts as a copy of the list in
  force: add, remove and reorder lines (percent only, up to two decimals, sent in
  hundredths: 18.5 is 1850), or the single choice that the garage charges no tax;
  it starts now or "Starting on a date (at midnight)" in the garage's time (the
  first moment of that day there; the computer's own zone decides nothing).
  Nothing is changed in place: the form says the current taxes keep being charged
  until the new ones start and the old list stays on record, and the page's only
  write is a new list.
  `src/taxes.js`, `src/TaxesPage.jsx`.
- **Getting paid** (`/garages/:id/stripe-account`, its `onboarding-link` and
  `refresh`): a garage that takes pass holders only needs nothing here. With no
  account, a country and "Set up getting paid", which makes the account and
  opens Stripe's page in a new tab. With one, what it can do now in plain words,
  each fact with when it was checked, "Check again", and "Continue on Stripe"
  while the details are not finished. No account id or Stripe code is shown.
  `src/payments.js`, `src/GettingPaidPage.jsx`.
- **Card readers** (`/stripe-account/location`, `/readers`, `/lanes/:id/reader`):
  offered only when the account can take cards, as the setup checklist counts
  it; otherwise what to do first, with the way to Getting paid. The readers'
  address is entered once and then shown: it is sent as the address and, as the
  place's name, the same address on one line (Stripe's limit for that name is
  1,000 characters), which the platform's read gives back. Each way out with its
  reader or "No card reader"; connect one with the code its screen shows and a
  name, or disconnect it, confirmed on the page. The code is kept nowhere: not
  in browser storage, the address, a log line or a file; it is let go after
  every try. Every connection there has been, current first, prints and
  downloads like the other lists. `src/CardReadersPage.jsx`.
- **Every refusal** these three pages can meet is one plain sentence from the
  dictionaries, never the platform's, the engine's or Stripe's own words; the
  setup checklist's taxes, getting paid and card readers steps lead to them, and
  Quick Find finds each page and its settings.
- **Change log**: who changed what, before and after, when, in the garage's time.
  Below it and apart, the **refused attempts**, with how many there are: who
  tried what, why it was refused (true in whichever account's log it is read),
  how many times and when last -- so no number of them can push a change out
  of sight. Every value in words (a time zone as people say it, every choice of
  a setting), never as the code the platform keeps. A line about a person to
  tell names them as they are named now, says only what kind of change it was
  ("Changed to another name", never from what to what), and once they are
  removed says "A person who was removed": the platform keeps no name or
  anything else typed about a person in its log. Each list prints and
  downloads like the others. A panel's own button says what it does: "No, keep
  it" beside a "Yes", "Cancel" on a form, "Done" once a code is shown.
- **The change log sorted and chosen from** (U7b): above each list, small, on
  one line, Sort by (When, newest first or oldest first; Who; What) and What
  (ticks of the kinds of thing its lines are about: the garage, lanes, taxes
  and fees, card readers, people to tell …), and over the refused attempts
  Why (ticks of the reasons they were refused for, in the words the list
  uses). Only kinds and reasons the garage's log holds are offered; nothing
  ticked is everything; "Show everything" puts every choice back. Done on the
  screen, on the whole log as read: the pages ("21–40 of 57, of 312 in all"),
  Download Excel, Download PDF and Print all follow the choices and hold every
  line that matches, and the head of each file and of the print says what was
  chosen ("Only: lanes, taxes and fees · oldest first"), or "Everything".
  `src/changes.js` (`chosenLines`, `choiceWords`), `src/ChangesPage.jsx`.
- **A refused attempt is one line a row** on screen (U7b): who, what was tried
  and why are cut short with "…", and shown whole over the row while pointed
  at or with the keyboard's focus; the print and the files hold them whole.
- **Settings** (U7a): the Language and Look choosers, small, on a page of their
  own in the side list; the top of every other page keeps the garage's name,
  Change garage and Sign out. The sign-in screen keeps its own. `src/SettingsPage.jsx`.
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
| The two languages match, and each key is written once in each dictionary (a key written twice shows only its last words) | `npm run check-languages-match` |
| Text against background is at least 4.5 : 1, day and night | `npm run check-contrast` |
| No colour from the first look (all 25 of `d4c9301`), source and built | `npm run check-old-colours` |
| Quick Find finds every page in both languages; day/night/auto; language; what Home and the lists say is true in every state | `npm test` |
| The page never touches the session; it asks only its own origin, by relative address | `npm run check-page-stays-home` |
| Home says only what it shows (no breakdown the platform does not return) | `npm run check-home-claims` |
| Every field has a short description in both languages, at most 15 words | `npm run check-descriptions` |
| No source maps in the built site | `npm run build && npm run check-no-source-maps` |
| The downloaded files hold the list: built from `test/files-fixtures.js` with this computer in another zone, read back with Python openpyxl and pypdf (`scripts/files/readers.txt`, pinned by hash): row for row, garage time across a clock change, text stays text and 0 formulas, every character, long lists and long names, the file name, every column described; odd stored text (every control character, direction marks, zero-width characters, right-to-left and Chinese scripts, emoji, a name of only spaces, names of up to 100,000 characters) through every file, each made within 5 seconds, everything left out said | `npm run check-files` |
| Neither file maker is in the first page's JavaScript | `npm run build && npm run check-first-load` |
| No word of ours split inside the word, in any PDF: every list, both languages, from lists holding every word the pages can put in each column (every action, refusal, field and value, alert, lane state, month, time zone and currency), read back with pypdf column by column, cells and headings; a column is as wide as the longest of our words in it, and only a single word an owner typed that is longer than its whole column may break | `npm run check-pdf-words` |
| Download Excel, Download PDF and Print in a browser, against the stand-in, both languages, day and night, every file read back: the file is the list on screen, garage time, a fresh read for each click, a failed read and a 401 make no file, one click one file, the page policy unchanged and never broken; the same odd stored text through the screen, Print, both files, the file names and the notice, nothing in a name turning the words around it | `npm run build && npm run check-downloads` |
| The built site in a browser, signed in against a stand-in platform (`test/stub-platform.js`, never built into the site): sign-in, refusals, every failure, sign-out and any 401 clearing everything, garage time with the browser in another zone, print, English by default, the language kept on the profile across browsers and chosen at sign-in, a failed save said plainly, every description visible under its name on screen and in print (the choosers' and Quick Find's too), a lane whose only computer was cancelled, none confirmed inside, the page policy enforced; no request leaves it | `npm run build && npm run check-browser` |
| A print reads right with the browser's default settings (backgrounds off), on every page that prints, both languages: each state the screen shows -- a tick, confirmed or not, a step done or not yet, a lane open or closed, the answer chosen, which list is which -- read from the screen by what it is and found on paper as its word, beside what it belongs to | `npm run build && npm run check-print` |
| Taxes and fees, Getting paid and Card readers in a browser, against the stand-in, with the browser in Tokyo, both languages, day and night: no platform words on screen for any refusal, 18.5 sent as 1850 and "no tax" as a list with no lines, the start of a day in the garage's own time across a clock change, the Taxes page's only write a new list, the reader's code kept nowhere, who sees what (a pass-only garage, an account that cannot take cards yet), the words true in every state, every connection printed and downloaded and read back | `npm run build && npm run check-money-pages` |
| The owner's screens tidied (U7a), in a browser against the stand-in, both languages: no Language or Look chooser but on Settings and the sign-in screen; never "Cars inside" nor "Carros adentro" on a page, in Quick Find, a print or a file; a list of 312 (Garage View, the change log read across the platform's pages, its refused attempts, Alerts' 25 people) shows 20 a page, pages through every row once, and downloads and prints all of them; an empty list shows no Download or Print; a Confirm email that differs never saves; Home lists both garages and each opens its own | `npm run build && npm run check-tidy` |
| The change log sorted and chosen from (U7b), in a browser against the stand-in, both languages, with 312 changes and 57 refused attempts of many kinds: sorted each way, every line in that order across every page, none missed or repeated, and Excel, PDF and Print in that order; ticks only for kinds and reasons the log holds; two ticked, every line shown one of them, the count saying so, and Excel, PDF and Print holding exactly those and naming the choice; one drawing at a time, View, PDF and Print each that sheet only and the same as in the whole set; refused attempts one line a row at 1280 px, whole when pointed at, focused and printed; who gets which alert at most 20 rows a page, printed whole; Getting paid's Cancel at the right | `npm run build && npm run check-choices` |
| The Garages page and adding a garage (U7c), in a browser against the stand-in, both languages: two garages listed with their name, time zone, money, open or not and Setup steps done as the platform counts them, each row opening its own Setup; 45 paged at 20 with none missed or repeated; nothing picked until the owner picks, US time zones and US dollars first; Create garage pressed twice sends exactly one `POST /garages` of exactly name, timezone and currency, and the new garage is chosen with its "Garage details" done; a blank field (or a name of spaces) sends nothing and says why; a refusal says so and chooses nothing; an account with no garage is offered Add a garage on every page; the refused attempts' count with a choice ("24 of 120"); Quick Find | `npm run build && npm run check-garages` |
| Accepting an invite, a forgotten password, a new one chosen (U7d-2), in a browser against the stand-in (its four doors recorded from the platform), both languages: a ready invite accepted with a matching password signs in on the Garages page, the account in the language picked; used, expired, replaced and invalid each say so with no form; the token out of the address once read (back and forward too) and in no request's address or query, only a POST body; a password sent only when typed twice the same and at least 12 characters; Forgot the same for an email with an account and one without; a reset said on the sign-in screen, the old session ended, a used or ended link offering Forgot again; the United States' time zones whole, old names shown by today's, once; Setup's garage details; a Spanish name on one line beside a long zone | `npm run build && npm run check-invites` |
| A person removed is named in no view of the change log: added with a number in their name, renamed, changed and given alerts, then removed -- the page, the PDF, the Excel file and the print, both languages, say "A person who was removed" for each of their lines and hold none of their names, numbers, address or id; a printed row is never split across two sheets | `npm run build && npm run check-removed-person` |

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).

Open Parking AI does not accept outside contributions. Pull requests, issues and comments are limited to the maintainers.

The fonts keep their own licence, the SIL
Open Font License 1.1 (`src/fonts/*-OFL.txt`, `src/files/fonts/DMSans-OFL.txt`).
The file makers use jsPDF and fflate, both MIT.

---

Built by 72 Knots Method by 72Knots.ai
