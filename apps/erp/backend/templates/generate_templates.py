# -*- coding: utf-8 -*-
"""
Self-contained template generator for receipt/voucher/refund-voucher.
Reads the logo base64 from an existing template file (receipt-template.html),
uses the embedded CSS+HTML structure, and generates all three templates.
new-design.html is NOT needed.
"""
import re
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── 1. Extract logo from existing template ──────────────────────────
src_path = os.path.join(BASE_DIR, 'receipt-template.html')
with open(src_path, 'r', encoding='utf-8') as f:
    src = f.read()

logo_match = re.search(r'<img src="data:image/jpeg;base64,[^"]*"[^>]*class="logo"[^>]*>', src)
if logo_match:
    LOGO_IMG = logo_match.group(0)
    LOGO_SRC = re.search(r'src="([^"]*)"', LOGO_IMG).group(1)
else:
    LOGO_IMG = '<div class="logo-placeholder">شعار المعهد</div>'
    LOGO_SRC = ''

# ── 2. Base HTML/CSS (without new-design.html) ──────────────────────
BASE_CSS = '''
        :root {
            --primary-color: #000000;
            --gray-bg: #f7f7f7;
            --border-color: #333333;
        }

        @page {
            size: A5 landscape;
            margin: 0;
        }

        * {
            box-sizing: border-box;
            font-family: 'Cairo', Tahoma, Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #e5e7eb;
        }

        .receipt-container {
            width: 210mm;
            height: 148mm;
            background-color: #ffffff;
            padding: 10mm 15mm;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            position: relative;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 10px;
            margin-bottom: 15px;
        }

        .header-right {
            font-size: 11px;
            line-height: 1.6;
            font-weight: 600;
        }

        .header-center {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .bismillah {
            font-size: 13px;
            margin-bottom: 5px;
        }

        .logo {
            width: 80px;
            height: auto;
            display: block;
        }

        .logo-placeholder {
            width: 70px;
            height: 70px;
            border: 1px dashed #ccc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #777;
        }

        .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 250px;
            height: auto;
            opacity: 0.08;
            pointer-events: none;
            z-index: 0;
        }

        .header-left {
            text-align: right;
            font-size: 12px;
            line-height: 1.8;
            background-color: var(--gray-bg);
            padding: 8px 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            min-width: 150px;
        }

        .doc-title {
            text-align: center;
            font-size: 20px;
            font-weight: 700;
            margin: 5px 0 15px 0;
            letter-spacing: 1px;
        }

        .content-grid {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: 30px;
            flex-grow: 1;
        }

        .info-row {
            display: flex;
            align-items: flex-end;
            margin-bottom: 15px;
            font-size: 13px;
        }

        .info-label {
            font-weight: 600;
            margin-left: 8px;
            white-space: nowrap;
        }

        .info-value {
            flex-grow: 1;
            border-bottom: 1px dotted var(--border-color);
            text-align: center;
            font-weight: 700;
            padding-bottom: 2px;
            color: #222;
        }

        .financial-box {
            border: 1px solid var(--border-color);
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .fin-header {
            background-color: var(--primary-color);
            color: #fff;
            text-align: center;
            padding: 5px;
            font-size: 13px;
            font-weight: 700;
        }

        .fin-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 15px;
            border-bottom: 1px solid #eee;
            font-size: 13px;
        }

        .fin-row:last-child {
            border-bottom: none;
        }

        .fin-label {
            font-weight: 600;
        }

        .fin-value {
            font-family: monospace;
            font-weight: 700;
            font-size: 14px;
        }

        .currency-label {
            font-family: 'Cairo', Tahoma, Arial, sans-serif;
            font-size: 16px;
            font-weight: 700;
            margin-right: 4px;
        }

        .fin-highlight {
            background-color: var(--gray-bg);
            font-size: 14px;
        }
        
        .fin-highlight .fin-label {
            font-weight: 700;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: auto;
            padding-top: 15px;
        }

        .signature-block {
            text-align: center;
            font-size: 12px;
            font-weight: 600;
            width: 150px;
        }

        .signature-line {
            border-bottom: 1px solid var(--border-color);
            height: 30px;
            margin-bottom: 5px;
        }

        .footer-note {
            font-size: 10px;
            color: #555;
            background: #fdfdfd;
            padding: 4px 15px;
            border: 1px dashed #ccc;
            border-radius: 20px;
            text-align: center;
        }

        @media print {
            @page {
                size: A5 landscape;
                margin: 0;
            }
            body {
                background-color: #fff;
                margin: 0;
                padding: 0;
            }
            .receipt-container {
                box-shadow: none;
                border: none;
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
'''

def make_doc(title_var, header_number_label, header_number_var, content_grid_html):
    return '''<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>سند قبض - معهد الدراسات للغات والكمبيوتر</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <style>''' + BASE_CSS + '''    </style>
</head>
<body>

    <div class="receipt-container">
        
        <img src="''' + LOGO_SRC + '''" class="watermark" aria-hidden="true">

        <div class="header">
            <div class="header-right">
                الجمهورية اليمنية<br>
                وزارة التعليم الفني والتدريب المهني<br>
                مكتب التعليم الفني والتدريب المهني - تعز<br>
                معهد الدراسات واللغات وعلوم الكمبيوتر
            </div>
            
            <div class="header-center">
                <div class="bismillah">بسم الله الرحمن الرحيم</div>
                ''' + LOGO_IMG + '''
            </div>

            <div class="header-left">
                <div style="margin-bottom: 5px;">
                    <strong>''' + header_number_label + '''</strong> <span style="font-family: monospace; font-size:14px;">{{''' + header_number_var + '''}}</span>
                </div>
                <div>
                    <strong>التاريخ:</strong> <span style="direction: ltr; display: inline-block;">{{date}}</span>
                </div>
            </div>
        </div>

        <div class="doc-title">{{''' + title_var + '''}}</div>

        ''' + content_grid_html + '''

        <div class="footer">
            <div class="signature-block">
                توقيع المستلم
                <div class="signature-line"></div>
            </div>

            <div class="footer-note">
                أي كشط أو تعديل أو شطب يلغي هذا السند
            </div>

            <div class="signature-block">
                أمين الصندوق
                <div class="signature-line"></div>
                <span>{{cashier_name}}</span>
            </div>
        </div>

    </div>

</body>
</html>'''

def write_file(path, content):
    with open(path, 'wb') as f:
        f.write(content.encode('utf-8'))

# ── 3. Receipt template ─────────────────────────────────────────
receipt_content = '''        <div class="content-grid">
            
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">استلمنا من المتدرب/ة:</span>
                    <span class="info-value">{{student_name}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">رسوم مقرر / دورة:</span>
                    <span class="info-value">{{course_name}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">طريقة الدفع:</span>
                    <span class="info-value">{{payment_method}}</span>
                </div>
                <div class="info-row" style="margin-top: 20px;">
                    <span class="info-label">ملاحظات:</span>
                    <span class="info-value">.........................................................................</span>
                </div>
            </div>

            <div class="financial-box">
                <div class="fin-header">التفاصيل المالية</div>
                
                <div class="fin-row">
                    <span class="fin-label">سعر الدورة:</span>
                    <span class="fin-value">{{agreed_price}} <span class="currency-label">ريال</span></span>
                </div>
                
                {{discount_ar}}

                <div class="fin-row fin-highlight">
                    <span class="fin-label">المبلغ المدفوع:</span>
                    <span class="fin-value">{{paid_amount}} <span class="currency-label">ريال</span></span>
                </div>

                <div class="fin-row">
                    <span class="fin-label">المبلغ المتبقي:</span>
                    <span class="fin-value">{{balance}} <span class="currency-label">ريال</span></span>
                </div>
            </div>

        </div>'''

receipt_html = make_doc(
    'receipt_title_ar',
    'رقم السند:',
    'receipt_number',
    receipt_content
)

# ── 4. Voucher template ──────────────────────────────────────────
voucher_content = '''        <div class="content-grid">
            
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">المستلم:</span>
                    <span class="info-value">{{recipient_name}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">نوع الصرف:</span>
                    <span class="info-value">{{expense_type}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">البيان:</span>
                    <span class="info-value">{{description}}</span>
                </div>
                <div class="info-row" style="margin-top: 20px;">
                    <span class="info-label">ملاحظات:</span>
                    <span class="info-value">.........................................................................</span>
                </div>
            </div>

            <div class="financial-box">
                <div class="fin-header">المبلغ</div>
                
                <div class="fin-row fin-highlight" style="justify-content: center;">
                    <span class="fin-value" style="font-size: 22px;">{{amount}} <span class="currency-label">ريال</span></span>
                </div>
            </div>

        </div>'''

voucher_html = make_doc(
    'voucher_title_ar',
    'رقم السند:',
    'voucher_number',
    voucher_content
)

# ── 5. Refund voucher template ──────────────────────────────────
refund_content = '''        <div class="content-grid">
            
            <div class="info-section">
                <div class="info-row">
                    <span class="info-label">اسم المتدرب/ة:</span>
                    <span class="info-value">{{student_name}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">المقرر / الدورة:</span>
                    <span class="info-value">{{course_name}}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">سبب الاسترداد:</span>
                    <span class="info-value">{{reason}}</span>
                </div>
                <div class="info-row" style="margin-top: 20px;">
                    <span class="info-label">ملاحظات:</span>
                    <span class="info-value">.........................................................................</span>
                </div>
            </div>

            <div class="financial-box">
                <div class="fin-header">المبلغ المسترد</div>
                
                <div class="fin-row fin-highlight" style="justify-content: center;">
                    <span class="fin-value" style="font-size: 22px;">{{amount}} <span class="currency-label">ريال</span></span>
                </div>
            </div>

        </div>'''

refund_html = make_doc(
    'refund_title_ar',
    'رقم سند الاسترداد:',
    'refund_number',
    refund_content
)

# ── 6. Write files ──────────────────────────────────────────────
write_file(os.path.join(BASE_DIR, 'receipt-template.html'), receipt_html)
write_file(os.path.join(BASE_DIR, 'voucher-template.html'), voucher_html)
write_file(os.path.join(BASE_DIR, 'refund-voucher-template.html'), refund_html)

# ── 7. Verify ────────────────────────────────────────────────────
for name in ['receipt-template.html', 'voucher-template.html', 'refund-voucher-template.html']:
    path = os.path.join(BASE_DIR, name)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    placeholders = re.findall(r'\{\{([^}]+)\}\}', content)
    images = re.findall(r'<img src="data:image/jpeg;base64,([^"]+)"', content)
    print(f'\n{name}:')
    print(f'  Size: {len(content)} chars')
    print(f'  Images: {len(images)} ({[len(i) for i in images]})')
    print(f'  Placeholders: {sorted(set(placeholders))}')
