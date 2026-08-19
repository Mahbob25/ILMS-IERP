import re
import sys

def fix_template(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. HTML tag
    content = content.replace('<html lang="en">', '<html lang="ar" dir="rtl">')

    # 2. Title
    content = re.sub(r'<title>.*?</title>', '<title>الإيصال - معهد الدراسات للغات والكمبيوتر</title>', content)

    # 3. Remove header-en CSS block
    content = re.sub(r'\.header-en\s*\{[^}]*\}', '', content)

    # 4. Update header-ar CSS
    content = re.sub(
        r'\.header-ar\s*\{[^}]*\}',
        '''.header-ar {
    flex: 1;
    font-size: 12px;
    text-align: right;
    direction: rtl;
    line-height: 1.5;
    font-weight: bold;
    font-family: 'Traditional Arabic', 'Times New Roman', Times, serif;
    color: #000;
}''',
        content
    )

    # 5. Update header-center CSS
    content = re.sub(
        r'\.header-center\s*\{[^}]*\}',
        '''.header-center {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}''',
        content
    )

    # 6. Remove divider CSS
    content = re.sub(r'\.divider\s*\{[^}]*\}', '', content)

    # 7. Update .content CSS
    content = re.sub(
        r'\.content\s*\{[^}]*\}',
        '''.content {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    padding: 0 3mm;
}''',
        content
    )

    # 8. Update content-ar CSS
    content = re.sub(
        r'\.content-ar\s*\{[^}]*\}',
        '''.content-ar {
    width: 100%;
    text-align: right;
    direction: rtl;
    font-size: 12px;
    line-height: 2.2;
    font-family: 'Traditional Arabic', Tahoma, Arial, sans-serif;
    color: #000;
}''',
        content
    )

    # 9. Remove content-en CSS
    content = re.sub(r'\.content-en\s*\{[^}]*\}', '', content)

    # 10. Update doc-title h2 CSS
    content = re.sub(
        r'\.doc-title h2\s*\{[^}]*\}',
        '''.doc-title h2 {
    margin: 0;
    font-size: 22px;
    color: #000;
    font-family: 'Traditional Arabic', 'Times New Roman', Times, serif;
}''',
        content
    )

    # 11. Remove doc-title h3 CSS
    content = re.sub(r'\.doc-title h3\s*\{[^}]*\}', '', content)

    # 12. Update fill-in CSS
    content = re.sub(
        r'\.fill-in\s*\{[^}]*\}',
        '''.fill-in {
    border-bottom: 1px dotted #000;
    display: inline-block;
    text-align: center;
    color: #000;
    font-weight: bold;
    padding: 0 6px;
    font-family: 'Traditional Arabic', Tahoma, Arial, sans-serif;
    font-size: 11px;
}''',
        content
    )

    # 13. Update border padding
    def replace_border(m):
        cls = m.group(1)
        return f'''.{cls}-border {{
    border: 3px double #000;
    height: 100%;
    padding: 6mm 6mm 10mm 6mm;
    display: flex;
    flex-direction: column;
    position: relative;
}}'''
    content = re.sub(
        r'\.(receipt|voucher)-border\s*\{[^}]*\}',
        replace_border,
        content
    )

    # 14. Remove English header block
    content = re.sub(r'<div class="header-en">.*?</div>\s*', '', content, flags=re.DOTALL)

    # 15. Remove English title h3 line
    content = re.sub(r'<h3>\{\{.*?title_en.*?\}\}</h3>\s*', '', content)

    # 16. Remove content-en block
    content = re.sub(r'<div class="content-en">.*?</div>\s*', '', content, flags=re.DOTALL)

    # 17. Remove divider div
    content = re.sub(r'<div class="divider">\s*</div>\s*', '', content)

    # 18. Remove Cashier text
    content = re.sub(r'Cashier\s*', '', content)

    # 19. Remove English footer note line
    content = re.sub(r'<br>\s*Any scratch or alteration invalidates this[^<]*', '', content)

    # 20. Update terminology
    content = content.replace('السعر المتفق عليه', 'سعر الدورة')

    # 20b. Fix discount placeholder: backend uses discount_ar (full HTML), not discount
    content = re.sub(
        r'الخصم: <span class="fill-in" style="min-width:80px;">\{\{discount\}\}</span><br>',
        '{{discount_ar}}',
        content
    )

    # 21. Update footer-note CSS
    content = re.sub(
        r'\.footer-note\s*\{[^}]*\}',
        '''.footer-note {
    text-align: center;
    font-size: 9px;
    font-family: 'Traditional Arabic', 'Times New Roman', Times, serif;
    font-weight: bold;
}''',
        content
    )

    # 22. Update signature-block font
    content = re.sub(
        r'\.signature-block\s*\{[^}]*\}',
        '''.signature-block {
    text-align: center;
    font-size: 10px;
    font-weight: bold;
    font-family: 'Traditional Arabic', 'Times New Roman', Times, serif;
}''',
        content
    )

    # 23. Update issue-block font
    content = re.sub(
        r'\.issue-block\s*\{[^}]*\}',
        '''.issue-block {
    text-align: right;
    direction: rtl;
    font-size: 10px;
    font-family: 'Traditional Arabic', Tahoma, Arial, sans-serif;
    line-height: 1.6;
}''',
        content
    )

    # 24. Update .logo class
    content = re.sub(
        r'\.logo\s*\{[^}]*\}',
        '''.logo {
    width: 80px;
    height: auto;
    margin-top: 5px;
}''',
        content
    )

    # 25. Update footer
    content = re.sub(
        r'\.footer\s*\{[^}]*\}',
        '''.footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    z-index: 1;
    margin-top: auto;
    padding-top: 10px;
}''',
        content
    )

    # 26. Fix voucher/refund title
    content = content.replace('Payment Voucher', 'سند صرف')
    content = content.replace('Refund Voucher', 'سند استرداد')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f'Fixed: {filepath}')

if __name__ == '__main__':
    files = [
        'cert&recept/receipt-template.html',
        'cert&recept/voucher-template.html',
        'cert&recept/refund-voucher-template.html',
    ]
    for f in files:
        fix_template(f)
