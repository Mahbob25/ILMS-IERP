#!/usr/bin/env python3
"""Build a print-optimized RTL HTML file from user-testing-guide.md.

Outputs docs/guides/user-testing-guide.html (A4, RTL, Arabic font stack)
which can then be rendered to PDF with headless Chrome.
"""
from pathlib import Path
import re

import markdown

SRC = Path(__file__).resolve().parent.parent / "docs" / "guides" / "user-testing-guide.md"
OUT = Path(__file__).resolve().parent.parent / "docs" / "guides" / "user-testing-guide.html"

CSS = """
:root {
  --indigo: #1E3A8A;
  --teal: #0D9488;
  --slate-900: #0F172A;
  --slate-600: #475569;
  --slate-400: #94A3B8;
  --slate-200: #E2E8F0;
  --slate-100: #F1F5F9;
  --slate-50: #F8FAFC;
  --white: #FFFFFF;
  --emerald: #059669;
  --amber: #B45309;
  --rose: #BE123C;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "Cairo", "IBM Plex Sans Arabic", "Segoe UI", "Tahoma", sans-serif;
  background: var(--white);
  color: var(--slate-900);
  margin: 0;
  line-height: 1.75;
  font-size: 10.5pt;
}
.wrap { max-width: 900px; margin: 0 auto; padding: 24pt 40pt; }
header.cover {
  background: linear-gradient(135deg, #1E3A8A 0%, #2748a8 60%, #0D9488 100%);
  color: #fff;
  border-radius: 16px;
  padding: 28pt 24pt;
  margin-bottom: 22pt;
}
header.cover h1 { margin: 0 0 6pt 0; font-size: 24pt; line-height: 1.3; }
header.cover .sub { font-size: 12pt; opacity: 0.95; }
header.cover .url {
  display: inline-block; margin-top: 10pt; padding: 6pt 14pt;
  background: rgba(255,255,255,0.15); border-radius: 8pt;
  font-family: "Consolas", "Courier New", monospace; font-size: 10.5pt;
  direction: ltr;
}
h1 { font-size: 17pt; color: var(--indigo); border-bottom: 2px solid var(--indigo); padding-bottom: 4pt; margin: 26pt 0 10pt 0; }
h2 { font-size: 14pt; color: var(--indigo); margin: 22pt 0 8pt 0; }
h3 { font-size: 12pt; color: var(--teal); margin: 16pt 0 6pt 0; }
p { margin: 6pt 0; }
ul, ol { margin: 6pt 0; padding-inline-start: 22pt; }
li { margin: 2pt 0; }
strong { color: var(--slate-900); }
code {
  font-family: "Consolas", "Courier New", monospace;
  background: var(--slate-100); color: var(--slate-900);
  padding: 1pt 5pt; border-radius: 4pt; font-size: 9.5pt;
}
pre {
  background: var(--slate-50); border: 1px solid var(--slate-200);
  border-inline-start: 4px solid var(--indigo);
  padding: 10pt 12pt; border-radius: 8pt; overflow-x: auto;
  direction: ltr; text-align: left; font-size: 8.5pt; line-height: 1.5;
}
pre code { background: transparent; padding: 0; }
blockquote {
  margin: 8pt 0; padding: 8pt 14pt;
  border-inline-start: 4px solid var(--teal);
  background: #ECFDF5; color: #065F46; border-radius: 6pt;
}
table {
  width: 100%; border-collapse: collapse; margin: 10pt 0;
  font-size: 9.5pt;
}
th {
  background: var(--slate-100); color: var(--slate-600);
  font-weight: 700; text-align: start; padding: 6pt 8pt;
  border: 1px solid var(--slate-200);
}
td { padding: 6pt 8pt; border: 1px solid var(--slate-200); }
tr:nth-child(even) td { background: var(--slate-50); }
.checks { list-style: none; padding-inline-start: 4pt; }
.checks li::before { content: "☐  "; color: var(--indigo); font-weight: bold; }
.page-break { page-break-before: always; break-before: page; }
footer { margin-top: 26pt; padding-top: 10pt; border-top: 1px solid var(--slate-200); color: var(--slate-400); font-size: 8.5pt; text-align: center; }
@media print {
  body { font-size: 10pt; }
  .wrap { padding: 10mm; max-width: none; }
  header.cover { page-break-after: avoid; }
}
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>دليل اختبار نظام Al-Drasat ERP</title>
<style>{css}</style>
</head>
<body>
<div class="wrap">
<header class="cover">
  <h1>دليل اختبار نظام Al-Drasat ERP</h1>
  <div class="sub">فترة الاختبار: أسبوع واحد — دليل شامل لتجربة جميع الميزات</div>
  <div class="url">http://16.192.155.151/ar/login</div>
</header>
{body}
<footer>
  Al-Drasat ERP — دليل اختبار المستخدمين &nbsp;•&nbsp; وثيقة داخلية للتقييم
</footer>
</div>
</body>
</html>
"""


def add_classes(body: str) -> str:
    # Tag checklist `<li>[ ]...` (from "قائمة التحقق") so it renders as ☐ boxes.
    body = re.sub(
        r"<li>\s*\[ \](.*?)</li>",
        r'<li class="check-item">☐ \1</li>',
        body,
        flags=re.DOTALL,
    )
    # Force page break before the 7-day plan (اليوم الأول heading = second h1? first h1 is "دليل").
    # We instead add a classed wrapper by splitting on critical h1 segments.
    return body


def main() -> None:
    md_text = SRC.read_text(encoding="utf-8")
    md_text = md_text.replace("[ ]", "[ ]")  # preserve literal checklist markers
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "nl2br"],
        output_format="html",
    )
    body = add_classes(body)
    html = TEMPLATE.format(css=CSS, body=body)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT} ({len(html)} bytes)")


if __name__ == "__main__":
    main()