#!/usr/bin/env python3
"""
Karyotype view: say which strand the target sequence is in, and whether the genome agreed.

    sudo python3 install-karyotype-allele-strand.py /opt/baja-apps

py/bio/allele-selective-targets.py now returns the sequence to design against in TRANSCRIPT
orientation rather than always the genomic plus strand, together with the orientation it is in
and the result of checking the variant's reference allele against the genome. This shows both,
on the site card and in the two exports, and says so plainly when a variant's reference does
not match the base at its own coordinate, which is the state in which a wrong base reaches
synthesis without anything looking wrong.

Ship it with the new allele-selective-targets.py; the two are a pair. With the old one the new
columns are simply empty, which is harmless.

A PATCH, not a copy (manchester/karyotype.js is 20,000 lines and not otherwise part of a
deploy). If any of the four places it touches is not exactly as expected, nothing is written.
The file is kept beside itself as .before-allele-strand, and the result is compiled before it
replaces anything. Safe to run twice.
"""
import json, os, shutil, subprocess, sys, tempfile

MARK = "row.sequence_orientation = x.context_orientation;"
HUNKS = [
[
"                            + (x.context_retained ? '\\n  target  ' + x.context_retained + '\\n  spare   ' + x.context_lost : ''),",
"                            + (x.context_retained ? '\\n  target  ' + x.context_retained + '\\n  spare   ' + x.context_lost : '')\n                            // Which strand these are in decides what an oligo built on them\n                            // has to be, so it is said rather than assumed, and a variant\n                            // the genome contradicts is said loudest of all.\n                            + (x.reference_check && /^MISMATCH/.test(x.reference_check)\n                                ? '\\n  ' + x.reference_check + '. No sequence is offered for this site.'\n                                : (x.context_orientation ? '\\n  sequence is ' + x.context_orientation : '')),"
],
[
"                            { note: true, title: 'Target (' + W.aim + '): ' + (x.context_retained || 'no sequence available') },\n                            { note: true, title: 'Must survive: ' + (x.context_lost || 'no sequence available') },",
"                            { note: true, title: 'Target (' + W.aim + '): ' + (x.context_retained || 'no sequence available')\n                                + (x.context_orientation && x.context_retained ? '  [' + x.context_orientation + ']' : '') },\n                            { note: true, title: 'Must survive: ' + (x.context_lost || 'no sequence available') },"
],
[
"                row.sequence_to_target = x.context_retained;\n                row[W.csvOther] = x.context_lost;\n                row.context_start = x.context_start;",
"                row.sequence_to_target = x.context_retained;\n                row[W.csvOther] = x.context_lost;\n                // A sequence in a spreadsheet outlives the screen it came from, so it\n                // travels with the strand it is in and whether the genome agreed.\n                row.sequence_orientation = x.context_orientation;\n                row.reference_check = x.reference_check;\n                row.sequence_to_target_plus_strand = x.context_retained_plus;\n                row.context_start = x.context_start;"
],
[
"                row['Sequence to target'] = A(x.context_retained);\n                row[A(W.csvOther || 'the other copy')] = A(x.context_lost);\n                row['Context span'] = A(x.context_start + '-' + x.context_end);",
"                row['Sequence to target'] = A(x.context_retained);\n                row[A(W.csvOther || 'the other copy')] = A(x.context_lost);\n                row['Sequence orientation'] = A(x.context_orientation);\n                row['Reference check'] = A(x.reference_check);\n                row['Sequence to target, plus strand'] = A(x.context_retained_plus);\n                row['Context span'] = A(x.context_start + '-' + x.context_end);"
]
]
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
    os.write(fd, ('const src = ' + json.dumps(body) + ';\n'
                  + 'const i = src.indexOf("{"), j = src.lastIndexOf("}");\n'
                  + 'const AF = Object.getPrototypeOf(async function () {}).constructor;\n'
                  + 'new AF("lion_engine", src.slice(i + 1, j));\n').encode('utf-8'))
    os.close(fd)
    r = subprocess.run(['node', tmp], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('The patched file does not compile; nothing was written.\n' + (r.stderr or '')[:600])
finally:
    try: os.unlink(tmp)
    except Exception: pass

shutil.copyfile(p, p + '.before-allele-strand')
open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print('Patched', p)
print('Restart baja-server (it caches scripts), then hard-refresh the karyotype view.')
