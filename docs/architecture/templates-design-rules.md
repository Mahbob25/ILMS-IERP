# Certificate & Receipt Template Design Rules

Rules for designer agents modifying HTML templates in `apps/erp/backend/templates/` so changes stay compatible with the backend rendering pipeline.

## Files Covered

| File | Purpose | Backend Renderer |
|------|---------|-----------------|
| `receipt-template.html` | Payment receipt (student pays) | `voucher_service.py:89` → `render_receipt()` |
| `voucher-template.html` | Expense payment voucher (institute pays out) | `voucher_service.py:118` → `render_voucher()` |
| `refund-voucher-template.html` | Refund voucher (money returned to student) | `voucher_service.py:144` → `render_refund_voucher()` |
| `certificate-template.html` | Course completion certificate | `certificate_service.py:63` → `render_certificate()` |

---

## 1. Do NOT Change Template Variables

The backend uses regex `\{\{(.+?)\}\}` to substitute variables. The variable names must match exactly what the Python services pass.

### Receipt Template Variables (`render_receipt`)

```
{{receipt_title_ar}}  — "سند دفع"
{{receipt_number}}    — e.g. "RCPT-2026-000042"
{{date}}              — e.g. "2026/07/19"
{{student_name}}      — student full name (HTML-escaped)
{{course_name}}       — enrolled course name (HTML-escaped)
{{payment_method}}    — "نقداً" or "تحويل بنكي"
{{agreed_price}}      — e.g. "50000.00 YER"
{{discount_ar}}       — RAW HTML: either empty string or a <span> element
{{paid_amount}}       — e.g. "45000.00 YER"
{{balance}}           — e.g. "5000.00 YER"
{{cashier_name}}      — cashier name (HTML-escaped)
```

### Voucher Template Variables (`render_voucher`)

```
{{voucher_title_ar}}  — "سند صرف"
{{voucher_number}}    — voucher number
{{date}}              — date string
{{expense_type}}      — expense category label (localized)
{{recipient_name}}    — payee name (HTML-escaped)
{{description}}       — expense description (HTML-escaped)
{{amount}}            — e.g. "25000.00 YER"
{{cashier_name}}      — cashier name (HTML-escaped)
```

### Refund Voucher Variables (`render_refund_voucher`)

```
{{refund_title_ar}}   — "سند استرداد"
{{refund_number}}     — refund document number
{{date}}              — date string
{{student_name}}      — student name (HTML-escaped)
{{course_name}}       — course name (HTML-escaped)
{{reason}}            — "استرداد رسوم"
{{amount}}            — e.g. "50000.00 YER"
{{cashier_name}}      — cashier name (HTML-escaped)
```

### Certificate Template Variables (`render_certificate`)

```
{{student_name_ar}}   — student name
{{student_name_en}}   — student name (English field)
{{course_name_ar}}    — course name in Arabic
{{course_name_en}}    — course name in English
{{start_date}}        — course start date
{{end_date}}          — course end date
{{grade_ar}}          — e.g. "85.0% - Very Good"
{{grade_en}}          — same grade in English
{{issue_number}}      — e.g. "CERT-2026-000001"
{{issue_date}}        — e.g. "2026/07/19"
```

**Critical:** Never rename, remove, or change the casing of any `{{variable}}`. The backend will leave unknown variables as literal text (`{{unknown}}` stays as-is).

---

## 2. `{{discount_ar}}` Is Raw HTML (Not Plain Text)

In the receipt template, `{{discount_ar}}` is either:
- Empty string (no discount) — renders nothing
- A complete `<span>` element: `<span class="fill-in" style="min-width:80px;">-{amount} {currency}</span><br>`

**Design rule:** The element where `{{discount_ar}}` is placed must accept inline HTML. Do not wrap it in additional escaping or text-content-only nodes. If restructuring the financial table, the discount row must remain optional — either show the full row or hide it entirely when empty.

---

## 3. Page Dimensions Must Stay A5 Landscape (148mm × 210mm)

All three financial templates are printed on **A5 landscape** paper.

**CSS rules that must remain:**
```css
@page {
    size: A5 landscape;
    margin: 0;
}
.receipt-container { /* or equivalent wrapper */
    width: 210mm;
    height: 148mm;
}
```

- The container must be exactly 210mm wide × 148mm tall.
- `overflow: hidden` on the container is required — content must never overflow.
- Never allow scrollable content inside the printed area.
- Use `clamp()` or `mm`/`cm` units for spacing, not `vw`/`vh`.

---

## 4. Print Styles Are Not Optional

Every template has a `@media print` block. These rules must be preserved:

```css
@media print {
    @page { size: A5 landscape; margin: 0; }
    body { background: #fff; margin: 0; padding: 0; }
    .receipt-container {
        box-shadow: none !important;
        border: none !important;
        width: 210mm;
        height: 148mm;
        margin: 0 auto;
        padding: 10mm 15mm;
    }
    * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
}
```

- **Never remove `print-color-adjust: exact`** — the logo is base64 embedded and must print.
- Screen background colors (`#e5e7eb` body bg) must reset to white for print.
- Shadows must be removed for print (printer ink/toner).

---

## 5. Logo Is a Base64 Data URI (Do Not Replace the Path)

```html
<img src="data:image/jpeg;base64,/9j/4AAQ..." ...>
```

The logo is an inline base64 JPEG. Do not:
- Change the `src` to an external URL or relative path
- Remove or replace the base64 data
- Convert it to a different format (the backend loads this exact string)

If improving the logo quality, regenerate a new base64 string but keep the same `<img>` attributes (`class="logo"`, `width="80px"`, `height="auto"`).

---

## 6. Font Stack Must Include Arabic Fallbacks

All templates use Arabic-first RTL layout. The font stacks:

**Primary (from Google Fonts):**
```css
font-family: 'Cairo', Tahoma, Arial, sans-serif;
```

**fix_templates.py converted some elements to:**
```css
font-family: 'Traditional Arabic', 'Times New Roman', Times, serif;
```

**Design rule:**
- Keep Cairo as the primary font via the Google Fonts `@import` link.
- Always provide Arabic-safe fallbacks (`Tahoma`, `Traditional Arabic`, `Arial`).
- Never use fonts without Arabic glyph support as the primary face.
- The `direction: ltr` on `.fin-value` (monetary amounts) is deliberate — numbers are LTR even in Arabic text.

---

## 7. Three-Column Header Structure Is Fixed

```
┌──────────────────────────────────────────────────┐
│ [RIGHT] org info      [CENTER] logo+bismillah   [LEFT] doc# + date │
├──────────────────────────────────────────────────┤
```

- **Right column** (`.header-right`): 4-line organizational hierarchy (Yemen republic → ministry → office → institute name). This text is hardcoded in the HTML, not templated. Do not remove or rephrase it.
- **Center column** (`.header-center`): Bismillah text (`بسم الله الرحمن الرحيم`) + logo image. This is a cultural/religious requirement.
- **Left column** (`.header-left`): Document number + date using `{{variable}}` placeholders. This is a grey-background box with border.
- The bottom border of the header section (`.header` has `border-bottom: 2px solid var(--primary-color)`) must remain.

---

## 8. Footer Layout Must Have Three Elements

```
┌──────────────────────────────────────────────────┐
│ [SIGNATURE 1]     [CENTER NOTE]      [SIGNATURE 2] │
│ توقيع المستلم       أي كشط...         أمين الصندوق   │
└──────────────────────────────────────────────────┘
```

- **Left signature block**: "توقيع المستلم" (recipient signature) with an empty signature line
- **Center footer note**: "أي كشط أو تعديل أو شطب يلغي هذا السند" (anti-tampering notice) — this text varies slightly per template
- **Right signature block**: "أمين الصندوق" (cashier) with the `{{cashier_name}}` variable below
- The footer must use `margin-top: auto` (flexbox) to stay pinned to the bottom.

---

## 9. `fix_templates.py` Is the Migration Script — Don't Revert Its Changes

`apps/erp/backend/templates/fix_templates.py` transforms templates from an English LTR layout to the current Arabic RTL format. The transformations it applies include:

| Transformation | Detail |
|---------------|--------|
| HTML lang | `en` → `ar` dir `rtl` |
| Title | Localized to Arabic |
| CSS classes | Removed `.header-en`, `.content-en`, `.divider` |
| CSS properties | Updated to RTL alignment, Traditional Arabic font |
| Labels | "السعر المتفق عليه" → "سعر الدورة" |
| Discount | Plain `{{discount}}` → raw HTML `{{discount_ar}}` |
| English blocks | Entire English divs removed |

If the script needs updating, run it on all three templates:
```bash
python apps/erp/backend/templates/fix_templates.py
```

---

## 10. HTML Structure Must Remain `<div>` Based (No Framework)

The backend loads templates as raw strings and uses regex substitution. This means:
- No template engines (Jinja2, Handlebars, Nunjucks) — only `{{variable}}` syntax
- No JavaScript-based rendering — templates are server-side rendered to HTML strings
- No external CSS/JS dependencies beyond the Google Fonts `<link>`
- Keep the CSS inline in `<style>` blocks — no external stylesheets
- The `<!DOCTYPE html>` and basic HTML structure must remain intact

---

## 11. CSS Custom Properties Are the Theming API

```css
:root {
    --primary-color: #000000;
    --gray-bg: #f7f7f7;
    --border-color: #333333;
}
```

To change the template color scheme, only modify these three variables. Do not hardcode color values elsewhere unless they are intentionally different (e.g., the red `#e53e3e` for error states, the grey body background `#e5e7eb`).

---

## 12. Financial Values Always Use `direction: ltr` + `monospace`

Monetary amounts (`.fin-value`) must:
- Use `direction: ltr` (numbers read left-to-right even in Arabic text)
- Use `font-family: monospace` for alignment
- Use `font-weight: 700` for emphasis
- Not be broken across lines

---

## 13. Content Must Fit in One A5 Page Without Overflow

The A5 landscape container (210mm × 148mm) is rigid. Content rules:
- At most 6–8 data rows in the info section
- At most 4–5 financial rows in the financial box
- Font sizes should stay between 10px–14px body, 18px–22px title
- If content is too dense, split into multiple slides/sections, do not shrink font below 9px
- Use `flex-grow: 1` on mid sections, `margin-top: auto` on footer

---

## 14. Certificate Template Has Its Own Layout Rules

The certificate template (`certificate-template.html`) is distinct from the financial templates:
- Uses A4 portrait (not A5 landscape)
- Has a decorative border/frame
- Contains both Arabic and English student/course names
- Includes grade information with percentage
- May have different signature/issuance block layout

Consult this file separately before modifying.

---

## Quick Reference: What Designers CAN Change

- Colors (via `--primary-color`, `--gray-bg`, `--border-color` CSS vars only)
- Typography details within the allowed font stacks
- Spacing, padding, borders (but maintain A5 dimensions)
- Visual hierarchy, alignment, font weights
- The anti-tampering notice text (footer note)
- Base64 logo quality (same dimensions)
- Background patterns (must survive print with `print-color-adjust: exact`)

## What Designers MUST NOT Change

- Template variable names/placeholders (`{{variable}}`)
- Page size (A5 landscape for financial, A4 portrait for certificate)
- HTML structure that would break regex matching
- Remove `print-color-adjust: exact`
- Remove RTL attributes (`dir="rtl"`, `lang="ar"`)
- Add external dependencies or JavaScript
- Change the organizational hierarchy text
- Remove the bismillah or logo
