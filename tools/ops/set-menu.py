#!/usr/bin/env python3
"""
Home and the funds options in the header menu, without rebuilding the front end.

    sudo python3 set-menu.py /eln/assets/env.js          # put them in
    python3 set-menu.py /eln/assets/env.js --show        # print the block it would write
    sudo python3 set-menu.py /eln/assets/env.js --remove # take them out again

The toolbar menu is built from window.env.menu: a list of {label, path}, where the shell
calls exec(path) and does nothing else -- no clear(), no history entry. So each entry here
points at a small module in baja-apps that does those two things and then opens the real
screen (baja/menu/home.js, new-campaign.js, my-campaigns.js). Install those first, with
install-fundraise-app.py.

It MERGES rather than replaces. The block it writes runs after env.js has built its own
menu and puts Home first and the two funds options after it, leaving every other entry
alone and in its order. Written as code rather than as a rewritten array because the menu
in env.js is this deployment's business and a script that parses and re-emits it would
quietly drop whatever it failed to understand.

env.js is a runtime file that the deploy script preserves, so this is a file edit and a
reload rather than an Angular build. Safe to run twice: it replaces its own block. The
file is backed up beside itself the first time, and the result is checked with node before
anything is written -- a syntax error in env.js is a white screen, not a wrong menu.
"""
import os, re, shutil, subprocess, sys, tempfile

MARK_OPEN = '  /* ---- header menu: Home and the funds options (set-menu.py) ---- */'
MARK_CLOSE = '  /* ---- end header menu ---- */'

ITEMS = [
    ('Home', 'baja/menu/home.js'),
    ('Start a campaign', 'baja/menu/new-campaign.js'),
    ('My campaigns', 'baja/menu/my-campaigns.js'),
]

def block():
    want = ', '.join('{ label: "%s", path: "%s" }' % (l, p) for l, p in ITEMS)
    return '\n'.join([
        MARK_OPEN,
        '  (function () {',
        '    var want = [%s];' % want,
        '    var had = (window["env"]["menu"] || []).filter(function (e) {',
        '      return !want.some(function (w) { return w.path === e.path || w.label === e.label; });',
        '    });',
        '    window["env"]["menu"] = want.concat(had);',
        '  })();',
        MARK_CLOSE,
    ]) + '\n'

args = sys.argv[1:]
show = '--show' in args
remove = '--remove' in args
rest = [a for a in args if not a.startswith('--')]
path = os.path.expanduser(rest[0] if rest else '/eln/assets/env.js')

if show:
    print(block())
    sys.exit(0)

if not os.path.isfile(path):
    sys.exit('Not found: ' + path + '  (pass the path to the deployed env.js)')

raw = open(path, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')
pat = re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE) + r'\n?'

if remove:
    if not re.search(pat, s, flags=re.S):
        sys.exit('There is no block from this script in ' + path + '. Nothing was changed.')
    s = re.sub(pat, '', s, count=1, flags=re.S)
    what = 'Removed the menu block from'
elif re.search(pat, s, flags=re.S):
    s = re.sub(pat, block(), s, count=1, flags=re.S)
    what = 'Updated'
else:
    if 'window["env"]' not in s and "window['env']" not in s:
        sys.exit(path + ' has no window["env"] assignments, so it is not the file this expects.'
                 ' Nothing was changed.')
    # At the END of the IIFE rather than after the last window["env"] line: several of
    # those statements run over more than one line, and inserting into the middle of one
    # leaves a file that does not parse.
    close = list(re.finditer(r'^\s*\}\)\s*\(.*\)\s*;?\s*$', s, flags=re.M))
    at = close[-1].start() if close else len(s)
    s = s[:at] + '\n' + block() + '\n' + s[at:]
    what = 'Added to'

fd, tmp = tempfile.mkstemp(suffix='.js')
try:
    os.write(fd, s.encode('utf-8')); os.close(fd)
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('The result does not parse (' + (r.stderr or '').strip().split('\n')[0] + ').'
                 ' Nothing was changed.')
except FileNotFoundError:
    pass                      # no node on this box: write it, the app will tell you
finally:
    try: os.unlink(tmp)
    except OSError: pass

if not os.path.exists(path + '.before-menu'):
    shutil.copyfile(path, path + '.before-menu')
open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print(what, path)
for l, p in ITEMS:
    print('  %-18s %s' % (l, p))
print('Reload the app to see them (env.js is served with no-store, so no restart).')
