"""Regenerate the four one-page PDFs after `python build.py`.

Optional dependencies: python -m pip install reportlab pymupdf
Use --font-dir for a folder containing the NotoSans-Regular.ttf and
NotoSans-Bold.ttf pair. The standard Linux Noto directory is tried by default.
A TrueType CJK font can be supplied with --cjk-font; the default is the
embeddable Droid Sans Fallback distributed with PyMuPDF.
"""

import argparse
import io
import json
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from platform_build import CONTACT_TEXT, LANGUAGES, PUBLIC_SITE, SHELL_TEXT, research_brief_file


ROOT = Path(__file__).resolve().parent
PAGE_W, PAGE_H = A4
MARGIN = 36
WIDTH = PAGE_W - 2 * MARGIN
INK = "#182e2b"
GREEN = "#086254"
MUTED = "#455c56"
RULE = "#cad7d0"
PAPER_GREEN = "#eaf3ed"
DARK = "#143e38"
EMAIL = "yanwei.wang@nu.edu.kz"


class Comparison(HTMLParser):
    """Read the visible case's machine-readable parameters from its own page."""

    def __init__(self):
        super().__init__()
        self.in_comparison = False
        self.it_mw = None
        self.hours = None
        self.cases = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "dl" and attrs.get("id") == "july-comparison":
            self.in_comparison = True
            self.it_mw = attrs["data-it-mw"]
            self.hours = attrs["data-hours"]
        elif self.in_comparison and tag == "div" and "data-off" in attrs:
            self.cases.append((attrs["data-supply"], attrs["data-off"]))

    def handle_endtag(self, tag):
        if tag == "dl":
            self.in_comparison = False


def register_fonts(font_dir, cjk_font):
    for name, filename in (("Text", "NotoSans-Regular.ttf"), ("Strong", "NotoSans-Bold.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
    cjk = str(cjk_font) if cjk_font else io.BytesIO(pymupdf.Font("china-s").buffer)
    pdfmetrics.registerFont(TTFont("Han", cjk))


def layout(canvas, language, content, case, web_url, size, draw=False):
    """Measure or paint the same layout. Coordinates below run down from the top."""
    contact = CONTACT_TEXT[language]
    chinese = language == "zh-Hans"
    base = "Han" if chinese else "Text"
    accent = "Han" if chinese else "Strong"

    def paragraph(value, x, top, width, *, points=size, leading=None, bold=False,
                  color=INK, link=None, underline=False):
        text = escape(str(value))
        if link:
            text = f'<link href="{escape(link, quote=True)}">{text}</link>'
        if underline:
            text = f"<u>{text}</u>"
        style = ParagraphStyle("brief", fontName=accent if bold else base,
                               fontSize=points, leading=leading or points * 1.31,
                               textColor=HexColor(color), wordWrap="CJK" if chinese else None)
        block = Paragraph(text, style)
        _, height = block.wrap(width, PAGE_H)
        if draw:
            block.drawOn(canvas, x, PAGE_H - top - height)
        return top + height

    def rule(x, top, width):
        if draw:
            canvas.setStrokeColor(HexColor(RULE))
            canvas.setLineWidth(0.55)
            canvas.line(x, PAGE_H - top, x + width, PAGE_H - top)

    def box(x, top, width, height, color):
        if draw:
            canvas.setFillColor(HexColor(color))
            canvas.rect(x, PAGE_H - top - height, width, height, stroke=0, fill=1)

    brand = "KazDC " + SHELL_TEXT[language]["brand"]
    brand_bottom = paragraph(brand, MARGIN, 30, WIDTH * .57, points=13.5, bold=True)
    institute = "INMET · " + contact["university"]
    institute_bottom = paragraph(institute, MARGIN + WIDTH * .61, 32, WIDTH * .39,
                                 points=10, bold=True, color=GREEN, link=contact["institute_url"])
    y = max(brand_bottom, institute_bottom) + 9
    rule(MARGIN, y, WIDTH)
    title_size = size * 2.15
    single_line = WIDTH / pdfmetrics.stringWidth(content["briefTitle"], accent, 1)
    if single_line >= title_size * .92:
        title_size = min(title_size, single_line - .1)
    y = paragraph(content["briefTitle"], MARGIN, y + 10, WIDTH,
                  points=title_size, leading=title_size * 1.16, bold=True) + 4
    y = paragraph(content["briefIntro"], MARGIN, y, WIDTH, points=size + .8, color=MUTED) + 13

    band_top = y
    band_width = WIDTH - 26
    metric_width = band_width * .445
    band_x = MARGIN + 13
    first_row = y + 9
    field = content["briefCase"].format(it=case.it_mw)
    metric = content["briefMetric"].format(hours=case.hours)
    # Measure the band before painting its background, including longer translations.
    def measure(value, width, points, bold=False):
        style = ParagraphStyle("metric", fontName=accent if bold else base, fontSize=points,
                               leading=points * 1.31, wordWrap="CJK" if chinese else None)
        return Paragraph(escape(str(value)), style).wrap(width, PAGE_H)[1]

    band_title_h = measure(field, band_width, size, True)
    metric_h = measure(metric, metric_width - 5, size + 1)
    label_width = (band_width - metric_width - 12) / 2
    labels = [content["supplyLabel"].format(temperature=t).replace(" °C", "\u00a0°C")
              for t, off in case.cases]
    label_h = max(measure(label, label_width - 4, size - .5) for label in labels)
    band_height = band_title_h + max(metric_h, (size + 10) * 1.2 + label_h) + 25
    box(MARGIN, band_top, WIDTH, band_height, PAPER_GREEN)
    paragraph(field, band_x, first_row, band_width, bold=True, color=GREEN)
    metric_top = first_row + band_title_h + 5
    paragraph(metric, band_x, metric_top + 1, metric_width - 5, points=size + 1)
    for i, ((_, off), label) in enumerate(zip(case.cases, labels)):
        x = band_x + metric_width + 12 + i * label_width
        bottom = paragraph(off, x, metric_top - 2, label_width, points=size + 10,
                           leading=(size + 10) * 1.2, bold=True, color=DARK)
        paragraph(label, x, bottom, label_width - 4, points=size - .5, color=MUTED)
    y = band_top + band_height + 13

    y = paragraph(content["pilotTitle"], MARGIN, y, WIDTH, points=size + 5, bold=True) + 5
    y = paragraph(content["pilotIntro"], MARGIN, y, WIDTH, color=MUTED) + 7
    label_width = 113 if not chinese else 103
    for key in ("partner", "records", "time", "staff", "cost", "deliverable", "briefNext"):
        rule(MARGIN, y, WIDTH)
        top = y + 5
        lab = paragraph(content[key+"Label"], MARGIN, top, label_width - 9,
                        points=size - .15, bold=True, color=GREEN)
        body = paragraph(content[key], MARGIN + label_width, top, WIDTH - label_width)
        y = max(lab, body) + 5
    y += 5

    closing_h = measure(content["closing"], WIDTH - 24, size + 1.6, True) + 16
    box(MARGIN, y, WIDTH, closing_h, DARK)
    paragraph(content["closing"], MARGIN + 12, y + 8, WIDTH - 24, bold=True,
              points=size + 1.6, color="#ffffff")
    y += closing_h + 12
    link_end = paragraph(content["webLink"], MARGIN, y, WIDTH, bold=True, points=size - .1,
                         color=GREEN, link=web_url, underline=True)
    person = f'{contact["name"]} · {EMAIL}'
    contact_end = paragraph(person, MARGIN, link_end + 3, WIDTH, color=MUTED,
                            points=size - .3, link="mailto:" + EMAIL)
    return contact_end


def make_pdf(path, language, text, case, url):
    canvas = Canvas(str(path), pagesize=A4, invariant=1, pageCompression=1, lang=language)
    canvas.setTitle(text["briefTitle"])
    canvas.setAuthor("INMET · " + CONTACT_TEXT[language]["university"])
    for size in (11.6, 11.4, 11.2, 11.0, 10.8, 10.6, 10.4, 10.2, 10.0, 9.8):
        if layout(canvas, language, text, case, url, size) <= PAGE_H - 32:
            layout(canvas, language, text, case, url, size, draw=True)
            canvas.showPage()
            canvas.save()
            return
    raise ValueError(f"{language}: the brief no longer fits on a readable single page")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=ROOT)
    parser.add_argument("--language", choices=LANGUAGES, action="append", help="Default: all four")
    parser.add_argument("--font-dir", type=Path, default=Path("/usr/share/fonts/truetype/noto"))
    parser.add_argument("--cjk-font", type=Path)
    args = parser.parse_args()
    register_fonts(args.font_dir, args.cjk_font)
    root = args.project_root.resolve()
    target = root / "reference"
    target.mkdir(exist_ok=True)
    # Check all locales before replacing any published brief.
    with TemporaryDirectory(dir=target) as tmp:
        pending = []
        for lang in args.language or LANGUAGES:
            suffix = LANGUAGES[lang][0].replace("_", "-")
            page = "research-priorities" + suffix
            case = Comparison()
            case.feed((root / (page + ".html")).read_text(encoding="utf-8"))
            case.close()
            if len(case.cases) != 2 or not case.hours or not case.it_mw:
                raise ValueError(f"Missing the two model cases in {page}.html; run build.py first")
            content = json.loads((root / "web" / "research" / (lang + ".json")).read_text(encoding="utf-8"))
            pdf = Path(tmp) / Path(research_brief_file(lang)).name
            make_pdf(pdf, lang, content, case, PUBLIC_SITE + page + ".html")
            pending.append(pdf)
        for completed in pending:
            destination = target / completed.name
            completed.replace(destination)
            print(destination)


if __name__ == "__main__":
    main()

