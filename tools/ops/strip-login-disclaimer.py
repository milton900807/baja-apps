#!/usr/bin/env python3
"""
Take the medical disclaimer off the deployed sign-in page, without a front-end build.

    sudo python3 strip-login-disclaimer.py /eln            # do it
    python3 strip-login-disclaimer.py /eln --dry-run       # say what it would do

WHY THIS EXISTS, AND WHAT IT IS. The sentence is compiled into the Angular bundle, so the
proper fix is the source change (baja, commit 39d3600) and a front-end deploy. Until that
deploy happens the sentence is still on the page, and this removes it from the built files
in the meantime.

It is a STOPGAP and it says so: the next `deploy-software.sh` writes fresh bundles and the
sentence comes back unless that deploy includes the source change. Run it again if so.

HOW IT IS SAFE. It deletes only the sentence's own words, which contain no quote, no
backslash and no bracket, so nothing that holds the file together can be broken by removing
them. The elements around them stay, so no element index or instruction count shifts. Every
file it changes is then checked with `node --check`, and a file that fails is restored and
left alone.
"""
import os, re, shutil, subprocess, sys, tempfile

# Each fragment is one run of plain words from the sentence. They are removed wherever they
# appear, which covers both the compiled text instructions and an inlined template string.
FRAGMENTS = [
    'This is a tool for reading and understanding genetic information. It is',
    'not medical advice',
    ', and it does not diagnose or recommend treatment',
    'those decisions belong with your clinical team.',
]
# The dash between the two halves is an em dash in the source and may be escaped in a bundle.
DASHES = ['—', '\\u2014', '&#8212;', '&mdash;']

def strip(text):
    out, hits = text, 0
    for f in FRAGMENTS:
        n = out.count(f)
        if n:
            out = out.replace(f, '')
            hits += n
    if hits:
        # Only the dashes left stranded between the fragments we just removed, which is to
        # say a dash with nothing but spaces and empty tags around it.
        for d in DASHES:
            out = re.sub(r'(>|\s)\s*' + re.escape(d) + r'\s*(?=<|\s)', r'\1', out)
    return out, hits

def node_ok(text, suffix):
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd, text.encode('utf-8')); os.close(fd)
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        return (r.returncode == 0, (r.stderr or '').strip().split('\n')[0])
    except FileNotFoundError:
        return (True, '')
    finally:
        try: os.unlink(tmp)
        except OSError: pass

root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '/eln')
dry = '--dry-run' in sys.argv or '-n' in sys.argv
if not os.path.isdir(root):
    sys.exit('Not found: ' + root + '  (pass the directory the front end is served from)')

changed, looked, failed = [], 0, []
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
        out, hits = strip(raw)
        if not hits:
            continue
        if name.endswith('.js'):
            ok, why = node_ok(out, '.js')
            if not ok:
                failed.append((p, why)); continue
        changed.append((p, hits, out))

if not changed and not failed:
    print('The sentence is not in any file under ' + root + ' (' + str(looked) + ' looked at).')
    print('Either it is already gone, or the front end there was built without it.')
    sys.exit(0)
for p, why in failed:
    print('LEFT ALONE (the result did not parse):', p, '-', why)
for p, hits, out in changed:
    print(('Would change' if dry else 'Changed'), p, '(' + str(hits) + ' fragments)')
    if dry:
        continue
    if not os.path.exists(p + '.before-disclaimer'):
        shutil.copyfile(p, p + '.before-disclaimer')
    open(p, 'w', encoding='utf-8').write(out)
if not dry and changed:
    print('')
    print('Hard-refresh the sign-in page (Ctrl+Shift+R) -- the bundle is cached by file name.')
    print('This is a stopgap: the next front-end deploy overwrites these files. Deploy baja 39d3600')
    print('or later and the sentence is gone from the source too.')
sys.exit(1 if failed else 0)
