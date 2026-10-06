# Contributing to Open Parking AI

Open Parking AI does not accept outside contributions. Pull requests, issues and comments are limited to the maintainers.

## What gets rejected on sight

**Anything that handles a raw card number.** Payments are processor-tokenized,
end to end. If a primary account number can reach a variable in this codebase,
the design is wrong, not the code.

**A word typed into a screen.** Every word a person can read comes from the
English and Spanish dictionaries, in everyday language a garage owner would use.
The checks refuse a word written straight into a component, a word that is in
one language and not the other, and technical words in either.

**A request to another site.** The screens load everything they need from where
they are served — fonts included — because a garage's computer may only reach
its own network.

**A name from outside this project.** No product, module or hostname from the
maintainer's other, private software appears here — not in code, a comment, a
document, a test, a fixture, a file's path or a commit message.
`.github/scripts/check-no-sibling-names.js` enforces it in CI.

**A test that has never been seen to fail.** If you add a control, show it
failing when the thing it protects is removed. `npm run fail-controls` is the
worked example.

## Style

Match the code already there — its naming, its comment density, its idioms. A
change that reads like the file it lands in is easier to review than a better
one that does not.

Comments should say why, not what.

---

Built by 72 Knots Method by 72Knots.ai
