#!/usr/bin/env python3
"""Read downloaded files back with readers this project did not write.

    python3 scripts/files/read-files.py FILE...

Prints one JSON object: for each .xlsx (openpyxl) every sheet, its frozen
pane, every cell's kind, value and number format, and how many formulas the
workbook holds; for each .pdf (pypdf) the page count and each page's text.
The checks in scripts/check-files.js and scripts/check-downloads.js compare
what comes back with what the screens show.
"""

import json
import sys
from datetime import datetime

import openpyxl
from pypdf import PdfReader


def cell_of(cell):
    value = cell.value
    if value is None:
        return None
    if isinstance(value, datetime):
        kind, shown = "date", value.strftime("%Y-%m-%d %H:%M:%S")
    elif cell.data_type == "f" or (isinstance(value, str) and cell.data_type == "f"):
        kind, shown = "formula", str(value)
    elif isinstance(value, str):
        kind, shown = "text", value
    else:
        kind, shown = "number", repr(value)
    return {"kind": kind, "value": shown, "format": cell.number_format}


def read_xlsx(path):
    book = openpyxl.load_workbook(path)  # formulas kept as formulas, never computed
    sheets = []
    formulas = 0
    for sheet in book.worksheets:
        rows = []
        for row in sheet.iter_rows():
            cells = [cell_of(c) for c in row]
            formulas += sum(1 for c in cells if c and c["kind"] == "formula")
            rows.append(cells)
        sheets.append({"name": sheet.title, "frozen": sheet.freeze_panes, "rows": rows})
    return {"kind": "xlsx", "sheets": sheets, "formulas": formulas}


def read_pdf(path):
    reader = PdfReader(path)
    pages = []
    for page in reader.pages:
        box = page.mediabox
        off = []

        # Text placed outside the page is in the file but on no paper: named.
        def visit(text, cm, tm, _font, _size, box=box, off=off):
            if not text.strip():
                return
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            if not (float(box.left) <= x <= float(box.right) and float(box.bottom) <= y <= float(box.top)):
                off.append(text)

        text = page.extract_text(visitor_text=visit)
        pages.append({"text": text, "off_page": off})
    return {"kind": "pdf", "pages": pages}


def main(paths):
    out = {}
    for path in paths:
        if path.endswith(".xlsx"):
            out[path] = read_xlsx(path)
        elif path.endswith(".pdf"):
            out[path] = read_pdf(path)
        else:
            out[path] = {"kind": "unknown"}
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1:])
