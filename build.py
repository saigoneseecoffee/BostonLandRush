#!/usr/bin/env python3
"""Ghép src/ thành index.html (game) và Code.gs (Apps Script).
   python3 build.py            -> dùng API_URL thật
   python3 build.py --offline  -> API_URL rỗng (chế độ thử) ra file chỉ định bằng --out"""
import sys, pathlib
root = pathlib.Path(__file__).parent
API_URL = 'https://script.google.com/macros/s/AKfycbzHR2vM3RFjRDkZDAW1zsxBZ54GORqvYGLdybxvupMVNFAafcfFTAJEXqyXJZtCUqleCg/exec'
shared = (root / 'src/shared.js').read_text(encoding='utf8')
offline = '--offline' in sys.argv
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else str(root / 'index.html')
html = (root / 'src/client.html').read_text(encoding='utf8').replace('/*__SHARED__*/', shared).replace('/*__API_URL__*/', '' if offline else API_URL)
pathlib.Path(out).write_text(html, encoding='utf8')
if not offline:
    (root / 'Code.gs').write_text((root / 'src/server.gs').read_text(encoding='utf8').replace('/*__SHARED__*/', shared), encoding='utf8')
print('built', out, 'offline' if offline else 'online')
