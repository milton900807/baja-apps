#!/usr/bin/env python3
"""
Gapmer ASO Design, Advanced tab: open on the house layout -- one 20-mer, a 10-base gap, 2'-MOE wings and a
uniform PS backbone -- instead of on every length and gap the designer can enumerate. The fields still take
as many values as you want; 16,17,18,19,20 is one edit away.

    sudo python3 install-gapmer-advanced-defaults.py /opt/baja-apps

Edits aso-design-dialog.js (backed up as aso-design-dialog.js.before-advanced-defaults). Refuses, changing
nothing, if the file differs. Safe to run twice.
"""
import os, shutil, sys
HUNKS = [('                + \'<div id="ad-doc"></div>\'\n                + \'<div id="ad-adv" style="display:none;">\'\n                + \'<label style="\' + lbl + \'">ASO lengths (nt, comma-separated)</label>\'\n                + \'<input id="ad-lengths" value="\' + (isGapmer ? \'16,17,18,19,20\' : \'18,19,20\') + \'" style="\' + inp + \'"/>\'\n                + (isGapmer\n                    ? (\'<label style="\' + lbl + \'">Gap sizes (comma-separated)</label>\'\n                        + \'<input id="ad-gaps" value="8,9,10" style="\' + inp + \'"/>\'\n                        + \'<label style="\' + lbl + \'">Template chemistry</label>\' + wingSelect(\'ad-wing\', \'LNA\')\n                        + backboneEditor())\n                    : (\'<label style="\' + lbl + \'">Template chemistry</label>\' + wingSelect(\'ad-wing\', "2\'-MOE")\n                        + backboneEditor()))\n', '                + \'<div id="ad-doc"></div>\'\n                + \'<div id="ad-adv" style="display:none;">\'\n                + \'<label style="\' + lbl + \'">ASO lengths (nt, comma-separated)</label>\'\n                // THE ADVANCED TAB OPENS ON ONE LAYOUT, NOT ON THE WHOLE SEARCH SPACE. A gapmer\n                // programme runs on a house layout -- the 5-10-5 20-mer, full PS, 2\'-MOE wings --\n                // and the tab that exists to tune a design should start from the thing being\n                // made rather than from every length and gap the designer is able to enumerate.\n                // The lists still take as many values as you want: 16,17,18,19,20 is one edit away.\n                + \'<input id="ad-lengths" value="\' + (isGapmer ? \'20\' : \'18,19,20\') + \'" style="\' + inp + \'"/>\'\n                + (isGapmer\n                    ? (\'<label style="\' + lbl + \'">Gap sizes (comma-separated)</label>\'\n                        + \'<input id="ad-gaps" value="10" style="\' + inp + \'"/>\'\n                        + \'<label style="\' + lbl + \'">Template chemistry</label>\' + wingSelect(\'ad-wing\', "2\'-MOE")\n                        + backboneEditor())\n                    : (\'<label style="\' + lbl + \'">Template chemistry</label>\' + wingSelect(\'ad-wing\', "2\'-MOE")\n                        + backboneEditor()))\n'), ("            // The preset writes it, the strip and the text field edit it, and Run design reads\n            // it. The displayed length only decides how much of it is on screen.\n            let pattern = [];\n            const defLengths = isGapmer ? [16, 17, 18, 19, 20] : [18, 19, 20];\n            const lengthsNow = () => parseList(q('#ad-lengths') ? q('#ad-lengths').value : '', defLengths);\n            const shownLength = () => {\n                const sel = q('#ad-bb-len');\n", "            // The preset writes it, the strip and the text field edit it, and Run design reads\n            // it. The displayed length only decides how much of it is on screen.\n            let pattern = [];\n            const defLengths = isGapmer ? [20] : [18, 19, 20];\n            const lengthsNow = () => parseList(q('#ad-lengths') ? q('#ad-lengths').value : '', defLengths);\n            const shownLength = () => {\n                const sel = q('#ad-bb-len');\n"), ('                    params.enforce_non_overlapping = false;\n                }\n                if (mode === \'advanced\') {\n                    params.lengths = parseList(q(\'#ad-lengths\').value, isGapmer ? [16, 17, 18, 19, 20] : [18, 19, 20]);\n                    if (isGapmer) { params.gap_sizes = parseList(q(\'#ad-gaps\').value, [8, 9, 10]); }\n                    params.wing_modification = q(\'#ad-wing\') ? q(\'#ad-wing\').value : (isGapmer ? \'LNA\' : "2\'-MOE");\n                    params.chemistry_template = params.wing_modification;\n                    // The pattern itself, plus the two older parameters derived from it so a\n                    // design that only reads those still behaves: the majority linkage as the\n', '                    params.enforce_non_overlapping = false;\n                }\n                if (mode === \'advanced\') {\n                    params.lengths = parseList(q(\'#ad-lengths\').value, isGapmer ? [20] : [18, 19, 20]);\n                    if (isGapmer) { params.gap_sizes = parseList(q(\'#ad-gaps\').value, [10]); }\n                    params.wing_modification = q(\'#ad-wing\') ? q(\'#ad-wing\').value : "2\'-MOE";\n                    params.chemistry_template = params.wing_modification;\n                    // The pattern itself, plus the two older parameters derived from it so a\n                    // design that only reads those still behaves: the majority linkage as the\n')]
MARK = 'THE ADVANCED TAB OPENS ON ONE LAYOUT'
root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/baja-apps')
p = os.path.join(root, 'baja/manchester/menu/aso-design-dialog.js')
if not os.path.isfile(p):
    sys.exit('Not found: ' + p)
s = open(p, encoding='utf-8').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
if MARK in s:
    print('Already installed: ' + p)
    sys.exit(0)
for old, new in HUNKS:
    if s.count(old) != 1:
        sys.exit(p + ' differs from the version this update was made against. Nothing was changed.')
    s = s.replace(old, new, 1)
shutil.copyfile(p, p + '.before-advanced-defaults')
open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print('Updated', p)
print('Restart baja-server (it caches scripts), then hard-refresh the editor (Ctrl+Shift+R).')
