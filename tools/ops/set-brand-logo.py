#!/usr/bin/env python3
"""
The mark in the toolbar and the tab icon, per domain, without rebuilding the front end.

    sudo python3 set-brand-logo.py violet.svg                      # install and point gene.clinic at it
    sudo python3 set-brand-logo.py violet.svg --host baja.bio      # a different domain
    sudo python3 set-brand-logo.py --show                          # what env.js says now
    sudo python3 set-brand-logo.py --clear                         # back to the bull everywhere

One build serves gene.clinic and baja.bio, so the logo cannot be compiled in: the
fundraising site should not be wearing the design tool's bull, and the design tool should
not be wearing the fundraising mark. The file is named in assets/env.js, which belongs to
the deployment and is not replaced by a build.

It copies the image into <web root>/assets/logos/ and writes:

    window["env"]["brandLogo"] = { "gene.clinic": "assets/logos/<file>" };

The front end matches the hostname exactly or as a suffix, so one entry covers www. as
well, and falls back to the bull when nothing matches -- a missing entry must never leave
an empty square where the mark goes.

NEEDS THE FRONT END BUILT from baja main (the commit that reads brandLogo). Until then
this writes the setting and nothing reads it; the toolbar keeps the bull and says so when
you run it.

Accepts .svg, .png, .jpg, .jpeg, .webp, .gif, .ico. Safe to run twice: it replaces its own
block, and env.js is backed up beside itself the first time.
"""
import os, re, shutil, sys

OK_EXT = ('.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico')
MARK_OPEN = '  /* ---- the mark per domain (set-brand-logo.py) ---- */'
MARK_CLOSE = '  /* ---- end the mark ---- */'

args = sys.argv[1:]
show = '--show' in args
clear = '--clear' in args
host = 'gene.clinic'
env_path = '/eln/assets/env.js'
name = None
for flag, var in (('--host', 'host'), ('--env', 'env_path')):
    if flag in args:
        i = args.index(flag)
        if i + 1 >= len(args):
            sys.exit(flag + ' needs a value.')
        if var == 'host':
            host = args[i + 1]
        else:
            env_path = args[i + 1]
        del args[i:i + 2]
rest = [a for a in args if not a.startswith('--')]
img = rest[0] if rest else None
env_path = os.path.expanduser(env_path)
web = os.path.dirname(os.path.dirname(env_path))        # .../eln/assets/env.js -> .../eln


def block(entries):
    pairs = ', '.join('"%s": "%s"' % (h, p) for h, p in sorted(entries.items()))
    return '\n'.join([MARK_OPEN, '  window["env"]["brandLogo"] = { %s };' % pairs, MARK_CLOSE]) + '\n'


def current(s):
    out = {}
    m = re.search(re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE), s, flags=re.S)
    if m:
        for h, p in re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', m.group(0)):
            out[h] = p
    return out


if not os.path.isfile(env_path):
    sys.exit('Not found: ' + env_path + '  (pass --env <path to the deployed env.js>)')
raw = open(env_path, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')
have = current(s)

if show:
    print(env_path)
    if have:
        for h, p in sorted(have.items()):
            there = os.path.isfile(os.path.join(web, p))
            print('  %-22s %s%s' % (h, p, '' if there else '   (NOT ON DISK)'))
    else:
        print('  nothing set, so every domain shows the bull.')
    sys.exit(0)

if clear:
    pat = re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE) + r'\n?'
    if not re.search(pat, s, flags=re.S):
        sys.exit('There is no block from this script in ' + env_path + '. Nothing was changed.')
    s = re.sub(pat, '', s, count=1, flags=re.S)
    what = 'Removed the mark setting from'
else:
    if not img:
        sys.exit('Give the image to use, or --show / --clear. See --help.')
    img = os.path.expanduser(img)
    if not os.path.isfile(img):
        sys.exit('Not found: ' + img)
    ext = os.path.splitext(img)[1].lower()
    if ext not in OK_EXT:
        sys.exit('That is not an image this can use (' + ', '.join(OK_EXT) + ').')
    size = os.path.getsize(img)
    if size > 2 * 1024 * 1024:
        sys.exit('That file is %.1f MB. A 26-pixel mark should be a few kilobytes; use a smaller one.' % (size / 1048576.0))
    logos = os.path.join(web, 'assets', 'logos')
    if not os.path.isdir(logos):
        sys.exit('Not found: ' + logos + '  (is ' + web + ' really the serving directory?)')
    base = re.sub(r'[^A-Za-z0-9._-]', '-', os.path.basename(img))
    dest = os.path.join(logos, base)
    if os.path.abspath(dest) != os.path.abspath(img):
        shutil.copyfile(img, dest)
        try:
            os.chmod(dest, 0o644)
            st = os.stat(logos)
            os.chown(dest, st.st_uid, st.st_gid)
        except Exception:
            pass
    have[host] = 'assets/logos/' + base
    pat = re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE) + r'\n?'
    if re.search(pat, s, flags=re.S):
        s = re.sub(pat, lambda m: block(have), s, count=1, flags=re.S)
        what = 'Updated'
    else:
        close = list(re.finditer(r'^\s*\}\)\s*\(.*\)\s*;?\s*$', s, flags=re.M))
        at = close[-1].start() if close else len(s)
        s = s[:at] + '\n' + block(have) + '\n' + s[at:]
        what = 'Added to'

import subprocess, tempfile
fd, tmp = tempfile.mkstemp(suffix='.js')
try:
    os.write(fd, s.encode('utf-8')); os.close(fd)
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('The result does not parse (' + (r.stderr or '').strip().split('\n')[0] + '). Nothing was changed.')
except FileNotFoundError:
    pass
finally:
    try: os.unlink(tmp)
    except OSError: pass

if not os.path.exists(env_path + '.before-logo'):
    shutil.copyfile(env_path, env_path + '.before-logo')
open(env_path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print(what, env_path)
for h, p in sorted(have.items()):
    print('  %-22s %s' % (h, p))
if not clear:
    print('Reload to see it. If the toolbar still shows the bull, the front end has not been')
    print('built since this setting existed: deploy-all.sh --frontend.')
