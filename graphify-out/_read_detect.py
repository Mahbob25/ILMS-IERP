import json
from pathlib import Path
import collections

d = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8'))
files = d.get('files', {})
code = files.get('code', [])
doc = files.get('document', [])
paper = files.get('paper', [])
image = files.get('image', [])
video = files.get('video', [])

print(f"total_files={d.get('total_files', 0)}")
print(f"total_words={d.get('total_words', 0)}")
print(f"code={len(code)}")
print(f"document={len(doc)}")
print(f"paper={len(paper)}")
print(f"image={len(image)}")
print(f"video={len(video)}")
print(f"skipped_sensitive={len(d.get('skipped_sensitive', []))}")
print(f"scan_root={d.get('scan_root', '')}")

exts = collections.Counter()
for f in code:
    exts[Path(f).suffix] += 1
print(f"code_exts={dict(exts)}")
