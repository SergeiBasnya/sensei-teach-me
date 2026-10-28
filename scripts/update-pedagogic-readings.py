"""Refresh authored phrase readings from the shared local product convention."""
import json
from pathlib import Path
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from pedagogic_romaji import PedagogicRomanizer
romanize=PedagogicRomanizer()
changes=[]
for filename in ['src/data/lessons.ts','shared/learning-memory.ts']:
    path=Path(filename)
    def replace(match):
        japanese=json.loads(match[2]);before=json.loads(match[4]);after=romanize(japanese)
        if before!=after:changes.append(dict(file=filename,japanese=japanese,before=before,after=after))
        return match[1]+match[2]+match[3]+json.dumps(after,ensure_ascii=False)
    source=re.sub(r'(japanese:\s*)("(?:\\.|[^"\\])*")(,\s*romaji:\s*)("(?:\\.|[^"\\])*")',replace,path.read_text())
    path.write_text(source)
folder=Path('output/lot2');folder.mkdir(parents=True,exist_ok=True)
(folder/'authored-reading-changes.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2)+'\n')
print(f'{len(changes)} lectures mises à jour ; aucune phrase japonaise ou traduction changée.')
