#!/usr/bin/env python3
"""Read downloaded files back with readers this project did not write.

    python3 scripts/files/read-files.py FILE...

Prints one JSON object: for each .xlsx (openpyxl) every sheet, its frozen
pane, every cell's kind, value and number format, and how many formulas the
workbook holds; for each .pdf (pypdf) the page count, each page's text, each
line of text drawn with its place and size, and the file's title. The
checks in scripts/check-files.js and scripts/check-downloads.js compare what
comes back with what the screens show.

One rule of the Excel file format is applied here, because openpyxl 3.1.5 does
not: a character XML cannot hold (a control) is written in a cell's text as
_xHHHH_, and a written "_x005F_" is an underscore (ECMA-376 Part 1, 22.4.2.4).
Excel and Numbers read the text that way; openpyxl hands back the code instead
and, worse, drops every "x005F_". Without this, a garage name holding a control
character could never be read back as it was stored.
"""

import json
import re
import sys
from datetime import datetime

import openpyxl
import openpyxl.reader.excel
from openpyxl.cell.text import Text
from openpyxl.xml.constants import SHEET_MAIN_NS
from openpyxl.xml.functions import iterparse
from pypdf import PdfReader

XSTRING = re.compile("_x([0-9A-Fa-f]{4})_")


def read_string_table(xml_source):
    """openpyxl's own shared-string reader, with ECMA-376's _xHHHH_ rule in place of its x005F_ removal."""
    strings = []
    tag = "{%s}si" % SHEET_MAIN_NS
    for _, node in iterparse(xml_source):
        if node.tag == tag:
            text = Text.from_tree(node).content
            strings.append(XSTRING.sub(lambda m: chr(int(m.group(1), 16)), text))
            node.clear()
    return strings


openpyxl.reader.excel.read_string_table = read_string_table


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
        lines = []

        # Text placed outside the page is in the file but on no paper: named.
        def visit(text, cm, tm, _font, size, box=box, off=off, lines=lines):
            if not text:
                return
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            if text.strip() and not (float(box.left) <= x <= float(box.right) and float(box.bottom) <= y <= float(box.top)):
                off.append(text)
            if text.strip("\n"):
                lines.append([round(x, 2), round(y, 2), round(size * tm[0], 2), text])

        text = page.extract_text(visitor_text=visit)
        pages.append({"text": text, "off_page": off, "lines": lines})
    title = reader.metadata.title if reader.metadata else None
    return {"kind": "pdf", "pages": pages, "title": title}


def main(paths):
    out = {}
    for path in paths:
        if path.endswith(".xlsx"):
            out[path] = read_xlsx(path)
        elif path.endswith(".pdf"):
            out[path] = read_pdf(path)
        else:
            out[path] = {"kind": "unknown"}
    # ASCII escapes: a stored text may hold a lone surrogate, which UTF-8 cannot carry.
    json.dump(out, sys.stdout, ensure_ascii=True)


if __name__ == "__main__":
    main(sys.argv[1:])
