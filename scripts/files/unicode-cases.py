#!/usr/bin/env python3
"""The odd-text case set, built from Unicode's own tables, not chosen by hand.

    python3 scripts/files/unicode-cases.py

Prints one JSON object, for scripts/files/odd-text.js:
  version   the Unicode version of the tables (Python's unicodedata), which
            must be UNICODE below: the run stops otherwise;
  ranges    every code point's general category, as [first, last, category];
  cases     every Cc, every Cf, every Zs, Zl and Zp, every noncharacter, a
            sample of lone surrogates, of Mn, of private use (Co) and of
            unassigned (Cn) code points, and the visible scripts;
  counts    how many cases of each kind.

The case set was hand-picked until the U3 fix re-gate, and missed U+FFFF and
U+FFF9. Here no category is left to memory: a category is either taken whole
or sampled by a fixed rule, and the counts are printed in the receipt.
"""

import json
import sys
import unicodedata

# Python 3.12's tables, as installed in CI (.github/workflows/ci.yml).
UNICODE = "15.0.0"

# Visible text the class has always carried: each must come through whole.
VISIBLE = [
    ("e + U+0301", "é"),
    ("U+20DD alone", "⃝"),
    ("Arabic", "مرآب الميناء"),
    ("Hebrew", "חניון הנמל"),
    ("Chinese", "港口停车场"),
    ("Devanagari", "नमस्ते"),
    ("Thai", "ที่จอดรถ"),
    ("emoji", "🚗👨‍👩‍👧🇺🇸👍🏽"),
    # The Excel file's own escape, written as text, must come back as text.
    ('"_x0041_" as text', "_x0041_"),
]

# Samples: a fixed rule, so the set is the same on every run.
MARKS_SAMPLED = 24
PRIVATE_USE = [0xE000, 0xE001, 0xF8FF, 0xF0000, 0xFFFFD, 0x100000, 0x10FFFD]
LONE_SURROGATES = [0xD800, 0xDB7F, 0xDB80, 0xDBFF, 0xDC00, 0xDFFF]
# Unassigned: gaps that have stayed empty for decades in the Basic plane, and
# planes 4 to 13, which hold nothing at all. A newer Unicode in the browser or
# in node must not have filled them: odd-text.js checks that it has not.
UNASSIGNED = [0x0378, 0x0379, 0x0380, 0x038B, 0x038D, 0x03A2, 0x40000, 0x51234, 0x6ABCD, 0x7FFFD, 0x8FF00, 0x9ABCD, 0xA0000, 0xB5555, 0xC0001, 0xDEEEE]


def noncharacter(cp):
    return 0xFDD0 <= cp <= 0xFDEF or (cp & 0xFFFE) == 0xFFFE


def main():
    if unicodedata.unidata_version != UNICODE:
        sys.exit(f"unicode-cases.py: Python's Unicode tables are {unicodedata.unidata_version}, not {UNICODE}: use Python 3.12")

    ranges = []
    for cp in range(0x110000):
        gc = unicodedata.category(chr(cp))
        if ranges and ranges[-1][2] == gc and ranges[-1][1] == cp - 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp, gc])

    def one(group, cp):
        return {"id": f"U+{cp:04X}", "group": group, "text": chr(cp)}

    by = {}
    for cp in range(0x110000):
        by.setdefault(unicodedata.category(chr(cp)), []).append(cp)
    for cp in PRIVATE_USE:
        assert unicodedata.category(chr(cp)) == "Co", hex(cp)
    for cp in UNASSIGNED:
        assert unicodedata.category(chr(cp)) == "Cn" and not noncharacter(cp), hex(cp)
    marks = by["Mn"][:: len(by["Mn"]) // MARKS_SAMPLED][:MARKS_SAMPLED]

    cases = (
        [one("Cc control", cp) for cp in by["Cc"]]
        + [one("Cf format character", cp) for cp in by["Cf"]]
        + [one("Zs space", cp) for cp in by["Zs"]]
        + [one("Zl line separator", cp) for cp in by["Zl"]]
        + [one("Zp paragraph separator", cp) for cp in by["Zp"]]
        + [one("noncharacter", cp) for cp in range(0x110000) if noncharacter(cp)]
        + [one("Cs lone surrogate (sample)", cp) for cp in LONE_SURROGATES]
        + [one("Mn mark (sample)", cp) for cp in marks]
        + [one("Co private use (sample)", cp) for cp in PRIVATE_USE]
        + [one("Cn unassigned (sample)", cp) for cp in UNASSIGNED]
        + [{"id": label, "group": "visible", "text": text} for label, text in VISIBLE]
    )
    counts = {}
    for c in cases:
        counts[c["group"]] = counts.get(c["group"], 0) + 1
    # ASCII escapes: a lone surrogate cannot travel as UTF-8.
    json.dump({"version": unicodedata.unidata_version, "ranges": ranges, "cases": cases, "counts": counts}, sys.stdout, ensure_ascii=True)


if __name__ == "__main__":
    main()
