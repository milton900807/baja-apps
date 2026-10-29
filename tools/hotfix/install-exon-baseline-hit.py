#!/usr/bin/env python3
"""
Manchester editor: an exon is hit-tested on the track's baseline, graph.Y(track.tgraph.Y(0)), where it is
drawn, within 5 px above or below; other annotations keep their own y and the 10 px band.

    sudo python3 install-exon-baseline-hit.py /opt/baja-apps

Edits mouse-over-highlight.js (backed up as mouse-over-highlight.js.before-exon-baseline). Refuses, changing
nothing, if the file differs. Safe to run twice.
"""
import os, shutil, sys
HUNKS = [('        // menu. One value for both, so what is lit is what a click acts on.\n        const ANN_HIT_Y_PX = 10;\n\n        let current = null;\n', "        // menu. One value for both, so what is lit is what a click acts on.\n        const ANN_HIT_Y_PX = 10;\n        // AN EXON IS DRAWN ON THE TRACK'S BASELINE, graph.Y(track.tgraph.Y(0)), not at its own y, so\n        // it is hit-tested there, and tighter: within EXON_HIT_Y_PX screen pixels of that line. Testing\n        // against an.y put the hit band away from the bar that is actually drawn.\n        const EXON_HIT_Y_PX = 5;\n        const annHit = (track, an, y) => {\n            const isExon = ('' + (an && an.type)).toLowerCase() === 'exon';\n            const yi = isExon ? graph.Y(track.tgraph.Y(0)) : graph.Y(track.tgraph.Y(an.y));\n            return Math.abs(yi - graph.Y(y)) <= (isExon ? EXON_HIT_Y_PX : ANN_HIT_Y_PX);\n        };\n\n        let current = null;\n"), ('                    // click uses. The old test (0.05 in track units) scaled with the track height, so\n                    // on a tall track an exon lit -- and its menu opened -- from well above or below it.\n                    if (Math.abs(graph.Y(track.tgraph.Y(an.y)) - graph.Y(y)) <= ANN_HIT_Y_PX)\n                        an.select();\n                }\n', '                    // click uses. The old test (0.05 in track units) scaled with the track height, so\n                    // on a tall track an exon lit -- and its menu opened -- from well above or below it.\n                    if (annHit(track, an, y))\n                        an.select();\n                }\n'), ("                        for (let an of annotations) {\n                            if (!an) continue;\n                            const dy = Math.abs(graph.Y(track.tgraph.Y(an.y)) - graph.Y(y));\n                            if (dy > HIT_Y_PX && !hovered.has(an)) continue;\n                            an.select();\n                            // Build the annotation's type-specific menu (e.g. an exon menu).\n", "                        for (let an of annotations) {\n                            if (!an) continue;\n                            if (!annHit(track, an, y) && !hovered.has(an)) continue;\n                            an.select();\n                            // Build the annotation's type-specific menu (e.g. an exon menu).\n")]
MARK = 'EXON_HIT_Y_PX'
root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/baja-apps')
p = os.path.join(root, 'baja/manchester/menu/mouse-over-highlight.js')
if not os.path.isfile(p):
    sys.exit('Not found: ' + p)
s = open(p, encoding='utf-8').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
if MARK in s:
    print('Already installed: ' + p); sys.exit(0)
for old, new in HUNKS:
    if s.count(old) != 1:
        sys.exit(p + ' differs from the version this update was made against (install-exon-hit10.py first?). Nothing was changed.')
    s = s.replace(old, new, 1)
shutil.copyfile(p, p + '.before-exon-baseline')
open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print('Updated', p)
print('Restart baja-server (it caches scripts), then hard-refresh the editor (Ctrl+Shift+R).')
