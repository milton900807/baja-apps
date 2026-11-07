#!/usr/bin/env python3
"""
Karyotype view: one editor track per VCF.

    sudo python3 install-karyotype-vcf-tracks.py /opt/baja-apps

With a VCF on each side of the karyotype, opening a region in the oligo editor with both sides
(the default) now loads each ticked transcript twice: one track per VCF, labelled
"<gene> · <vcf file name>", and each track carries only that file's variants. With one file, or
with "Left only" / "Right only", the hand-off is the plain one it was.

Needs install-karyotype-side-choice.py applied first (deploy-all.sh runs it just before). A
PATCH, not a copy: if any of the places it touches is not exactly as expected, nothing is
written. The file is kept beside itself as .before-vcf-tracks, and the result is compiled before
it replaces anything. Safe to run twice.
"""
import os, shutil, subprocess, sys, tempfile

MARK = "const VCF_GROUP = ['vcf:R', 'vcf:L'];"
HUNKS = [["\n        // `side`: null or undefined for every variant in the range (the default), 1 for the\n        // file on the LEFT only, 0 for the file on the RIGHT only -- so a tumor/normal pair\n        // can be opened with one side's variants without the other's in the way.\n        const openRegions = async (list, focusBp, straight, side) => {\n            const regs = (list || []).filter((q) => q && q.i >= 0 && q.i < drawn.length\n                && isFinite(q.lo) && isFinite(q.hi) && q.hi >= q.lo);\n            if (!regs.length) { graph.setMessage(' Nothing selected to look up. '); return; }", "\n        // `side`: null or undefined for every variant in the range (the default), 1 for the\n        // file on the LEFT only, 0 for the file on the RIGHT only -- so a tumor/normal pair\n        // can be opened with one side's variants without the other's in the way.\n        // The group each side's variants travel under when both VCFs go to the editor,\n        // and the file name that labels its tracks.\n        const VCF_GROUP = ['vcf:R', 'vcf:L'];\n        const vcfName = (sd) => (sideFile[sd] ? shortFile(sideFile[sd]) : sideName(sd));\n        const openRegions = async (list, focusBp, straight, side) => {\n            const regs = (list || []).filter((q) => q && q.i >= 0 && q.i < drawn.length\n                && isFinite(q.lo) && isFinite(q.hi) && q.hi >= q.lo);\n            if (!regs.length) { graph.setMessage(' Nothing selected to look up. '); return; }"], ["                            annots.push('GT=' + gl.map((g) => GT_TEXT[g[1]] || './.').join(','));\n                            const ph = phaseOf(d, k);\n                            if (ph) annots.push('PHASE=' + ph);\n                        }\n                        inRange.push({\n                            chr: bare2, pos: d.pos[k], ref: ab[0], alt: ab[1],\n                            name: (d.names[k] || (c2.name + ':' + d.pos[k])),\n                            sig: sigOf(d, k),", "                            annots.push('GT=' + gl.map((g) => GT_TEXT[g[1]] || './.').join(','));\n                            const ph = phaseOf(d, k);\n                            if (ph) annots.push('PHASE=' + ph);\n                        }\n                        const sdK = d.side ? (d.side[k] ? 1 : 0) : 0;\n                        inRange.push({\n                            chr: bare2, pos: d.pos[k], ref: ab[0], alt: ab[1],\n                            name: (d.names[k] || (c2.name + ':' + d.pos[k])),\n                            sig: sigOf(d, k),"], ["                            samples: gl.map((g) => g[0]),\n                            genotypes: gl.map((g) => GT_TEXT[g[1]] || './.'),\n                            phase: gl.length ? phaseOf(d, k) : '',\n                            annotations: annots,\n                        });\n                    }\n                }\n            }\n            const one = regs.length === 1 ? regs[0] : null;\n            const c = one ? drawn[one.i] : null;\n            const lo = one ? one.lo : 0, hi = one ? one.hi : 0;\n            if (!genes.length) {", '                            samples: gl.map((g) => g[0]),\n                            genotypes: gl.map((g) => GT_TEXT[g[1]] || \'./.\'),\n                            phase: gl.length ? phaseOf(d, k) : \'\',\n                            annotations: annots,\n                            group: VCF_GROUP[sdK],\n                            vcf: vcfName(sdK),\n                        });\n                    }\n                }\n            }\n            // ONE TRACK PER VCF. With both files open, each transcript goes to the editor\n            // twice -- once per file, labelled "<gene> · <file>" -- and each copy carries\n            // only that file\'s variants. With one file (or one side asked for) the groups\n            // come off again and the hand-off is the plain one it always was.\n            const bothVcf = inRange.some((v) => v.group === VCF_GROUP[1]) && inRange.some((v) => v.group === VCF_GROUP[0]);\n            if (!bothVcf) for (const v of inRange) { delete v.group; delete v.vcf; }\n            const trackIds = (list) => {\n                if (!bothVcf) return list.map((gn) => gn.transcript).filter(Boolean);\n                const out = [];\n                for (const gn of list) {\n                    if (!gn || !gn.transcript) continue;\n                    const gname = gn.gene || gn.transcript;\n                    for (const sd of [1, 0]) {\n                        out.push({ id: gn.transcript, group: VCF_GROUP[sd], label: gname + \' \\u00b7 \' + vcfName(sd) });\n                    }\n                }\n                return out;\n            };\n            const one = regs.length === 1 ? regs[0] : null;\n            const c = one ? drawn[one.i] : null;\n            const lo = one ? one.lo : 0, hi = one ? one.hi : 0;\n            if (!genes.length) {'], ["                if (!pick.length) {\n                    graph.setMessage(' Nothing here has a transcript in the annotation to open. ');\n                    return;\n                }\n                await handToEditor(pick.map((gn) => gn.transcript), inRange, straight.focus || null);\n                return;\n            }\n            const spanAll = regs.reduce((t, q) => t + (q.hi - q.lo), 0);\n            const chrCount = new Set(regs.map((q) => q.i)).size;", "                if (!pick.length) {\n                    graph.setMessage(' Nothing here has a transcript in the annotation to open. ');\n                    return;\n                }\n                await handToEditor(trackIds(pick), inRange, straight.focus || null);\n                return;\n            }\n            const spanAll = regs.reduce((t, q) => t + (q.hi - q.lo), 0);\n            const chrCount = new Set(regs.map((q) => q.i)).size;"], ["            // being in after a failure -- the old code had already thrown it away.\n            let goBusy = false;\n            q2('#kr-go').onclick = async () => {\n                if (goBusy) return;\n                const ids = qa2('.kr-g').filter((cb) => cb.checked)\n                    .map((cb) => genes[+cb.getAttribute('data-i')].transcript).filter(Boolean);\n                if (!ids.length) { graph.setMessage(' Tick a transcript to open. '); return; }\n                goBusy = true;\n                const go = q2('#kr-go'), sv = q2('#kr-save');\n                const arm = (on) => {", "            // being in after a failure -- the old code had already thrown it away.\n            let goBusy = false;\n            q2('#kr-go').onclick = async () => {\n                if (goBusy) return;\n                const ids = trackIds(qa2('.kr-g').filter((cb) => cb.checked)\n                    .map((cb) => genes[+cb.getAttribute('data-i')]).filter(Boolean));\n                if (!ids.length) { graph.setMessage(' Tick a transcript to open. '); return; }\n                goBusy = true;\n                const go = q2('#kr-go'), sv = q2('#kr-save');\n                const arm = (on) => {"]]
root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '/opt/baja-apps')
p = os.path.join(root, 'manchester/karyotype.js')
if not os.path.isfile(p):
    sys.exit('Not found: ' + p)
raw = open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')
if MARK in s:
    print('Already there:', p)
    sys.exit(0)
for old, new in HUNKS:
    if s.count(old) != 1:
        where = max(old.split(chr(10)), key=lambda l: len(l.strip())).strip()[:80]
        sys.exit(p + ' differs from the version this change was made against, near: ' + where
                 + '\nNothing was changed. Send me that file and I will rebuild this installer against it.')
    s = s.replace(old, new, 1)

# Compile it the way the app does -- the body of an async function -- before it goes anywhere.
fd, tmp = tempfile.mkstemp(suffix='.js')
try:
    body = s.strip()
    os.write(fd, ('const src = ' + __import__('json').dumps(body) + ';\n'
                  + 'const i = src.indexOf("{"), j = src.lastIndexOf("}");\n'
                  + 'const AF = Object.getPrototypeOf(async function () {}).constructor;\n'
                  + 'new AF("lion_engine", src.slice(i + 1, j));\n').encode('utf-8'))
    os.close(fd)
    try:
        r = subprocess.run(['node', tmp], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit('The patched file does not compile (' + (r.stderr or '').strip().split(chr(10))[-1][:160] + '). Nothing was changed.')
    except FileNotFoundError:
        pass
finally:
    try: os.unlink(tmp)
    except OSError: pass

if not os.path.exists(p + '.before-vcf-tracks'):
    shutil.copyfile(p, p + '.before-vcf-tracks')
open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print('Updated', p, '(backup: karyotype.js.before-vcf-tracks)')
