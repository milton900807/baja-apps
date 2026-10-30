#!/usr/bin/env python3
"""
Reword the deployed gene.clinic sign-in page, without a front-end build.

    python3 retext-login.py /eln --dry-run      # say what it would do
    sudo python3 retext-login.py /eln           # do it

WHY THIS EXISTS. The sign-in card's headings are compiled into the Angular bundle, so the
proper fix is the source change (baja, commit c020fe9) and a front-end deploy. Until that
deploy happens the old words are still on the page. This changes them in the built files in
the meantime, and replaces strip-login-disclaimer.py, which only did the last of them.

It is a STOPGAP and says so: the next deploy-software.sh writes fresh bundles. Deploy baja
1c09b6c or later and these words come from the source, where they can also be overridden at
runtime from env.js (see set-login-copy.py) with no build at all.

HOW IT IS SAFE. Both the old and the new words are plain prose: no quote, no backslash, no
bracket, nothing that holds a JavaScript file together. Elements are left in place, so no
compiled element index or instruction count shifts. Every file it changes is then checked
with `node --check`, and one that fails is left exactly as it was.
"""
import os, re, shutil, subprocess, sys, tempfile

# Old words on the left, what they should say on the right. Apostrophes are avoided on the
# right: these land inside string literals whose quoting style is whatever the bundler chose.
REPLACE = [
    ('For a deeper understanding of genetic medicine',
     'No charge to run a campaign, 100% of the funds you raise go right into your cause.'),
    # In case this tool has already run once with the shorter line in it.
    ('Fundraising for rare disease', 'No charge to run a campaign, 100% of the funds you raise go right into your cause.'),
    ('Rare disease, explained', 'Understand it. Share it. Fund it.'),
    ('Understanding a rare condition, gene by gene', 'Raise money for a rare disease, and keep all of it'),
]

# The medical disclaimer, removed rather than reworded. Each entry is one run of plain words.
REMOVE = [
    'This is a tool for reading and understanding genetic information. It is',
    'not medical advice',
    ', and it does not diagnose or recommend treatment',
    'those decisions belong with your clinical team.',
]
DASHES = ['—', '\\u2014', '&#8212;', '&mdash;']

def rework(text):
    out, hits = text, 0
    for old, new in REPLACE:
        n = out.count(old)
        if n:
            out = out.replace(old, new); hits += n
    gone = 0
    for f in REMOVE:
        n = out.count(f)
        if n:
            out = out.replace(f, ''); gone += n
    if gone:
        hits += gone
        # Only a dash left stranded between the fragments just removed: one with nothing
        # but spaces or an empty tag either side of it.
        for d in DASHES:
            out = re.sub(r'(>|\s)\s*' + re.escape(d) + r'\s*(?=<|\s)', r'\1', out)
    return out, hits

def node_ok(text):
    fd, tmp = tempfile.mkstemp(suffix='.js')
    try:
        os.write(fd, text.encode('utf-8')); os.close(fd)
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        return (r.returncode == 0, (r.stderr or '').strip().split('\n')[0])
    except FileNotFoundError:
        return (True, '')
    finally:
        try: os.unlink(tmp)
        except OSError: pass

args = [a for a in sys.argv[1:] if not a.startswith('-')]
root = os.path.expanduser(args[0] if args else '/eln')
dry = '--dry-run' in sys.argv or '-n' in sys.argv
if not os.path.isdir(root):
    sys.exit('Not found: ' + root + '  (pass the directory the front end is served from)')

changed, failed, looked = [], [], 0
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in ('assets', 'node_modules')]
    for name in filenames:
        if not name.endswith(('.js', '.html')):
            continue
        p = os.path.join(dirpath, name)
        try:
            raw = open(p, encoding='utf-8', errors='strict').read()
        except (OSError, UnicodeDecodeError):
            continue
        looked += 1
        out, hits = rework(raw)
        if not hits:
            continue
        if name.endswith('.js'):
            ok, why = node_ok(out)
            if not ok:
                failed.append((p, why)); continue
        changed.append((p, hits, out))

for p, why in failed:
    print('LEFT ALONE (the result did not parse):', p, '-', why)
if not changed:
    print('Nothing to change under ' + root + ' (' + str(looked) + ' files looked at).')
    print('Either it is already done, or that front end was built from the newer source.')
    sys.exit(1 if failed else 0)
for p, hits, out in changed:
    print(('Would change' if dry else 'Changed'), p, '(' + str(hits) + ' pieces of text)')
    if dry:
        continue
    if not os.path.exists(p + '.before-retext'):
        shutil.copyfile(p, p + '.before-retext')
    open(p, 'w', encoding='utf-8').write(out)
if not dry:
    print('')
    print('Hard-refresh the sign-in page (Ctrl+Shift+R): the bundle is cached by file name.')
    print('A stopgap. The next front-end deploy overwrites these files; deploy baja c020fe9 or later.')
sys.exit(1 if failed else 0)
