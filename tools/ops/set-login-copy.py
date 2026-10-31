#!/usr/bin/env python3
"""
The gene.clinic sign-in card's words, without rebuilding the front end.

    sudo python3 set-login-copy.py /eln/assets/env.js        # write them
    python3 set-login-copy.py /eln/assets/env.js --show      # just look

The sign-in page reads its gene.clinic wording from window.env when it is there and falls back
to what is compiled into the bundle. env.js is a runtime file that the deploy script preserves,
so changing it is a file edit and a reload rather than an Angular build and a deploy.

WHAT TAKES EFFECT WHEN. The deployed bundle already reads clinicFeatures, so the bullet list
changes as soon as this runs. clinicBanner, clinicTag and clinicNote are read by the newer
bundle: writing them now is harmless, and they start showing the moment the front end is next
built and deployed.

clinicTitle is deliberately not written. The heading above the list is gone, and the newer
bundle draws no heading unless env.js names one -- so the way to have it back is to add
clinicTitle here, not to delete something.

The medical disclaimer is not settable here. It is compiled into the page on purpose: a
sentence that exists to stop someone reading a treatment decision into a gene drawing should
not be removable by editing a config file.

Safe to run twice: it replaces its own block rather than adding another. env.js is backed up
beside itself the first time. Nothing restarts; nginx serves that file with no-store, so the
next load has it.
"""
import os, re, shutil, sys

MARK_OPEN = '  /* ---- gene.clinic sign-in wording (set-login-copy.py) ---- */'
MARK_CLOSE = '  /* ---- end gene.clinic sign-in wording ---- */'

COPY = {
    'clinicBanner': 'No charge to run a campaign, 100% of the funds you raise go right into your cause.',
    'clinicTag': 'Understand it. Share it. Fund it.',
    # Exact rather than "free": this site takes nothing, and the card processor's fee is
    # not ours to waive. Both halves, in the same sentence, on a page about money.
    'clinicNote': 'There is no charge for this and no share of what you raise. '
                  'Gifts arrive in your own payment account, less the fee the card processor charges.',
    'clinicFeatures': [
        # All that is left after the owner went through this list: the one line that
        # says something the banner above it does not, which is where the money lands.
        "Donations go straight to your own account, minus the card processor's own fee",
    ],
}

def js(v):
    if isinstance(v, list):
        return '[\n' + ''.join('    ' + js(x) + ',\n' for x in v) + '  ]'
    return '"' + str(v).replace('\\', '\\\\').replace('"', '\\"') + '"'

def block():
    out = [MARK_OPEN]
    for k, v in COPY.items():
        out.append('  window["env"]["%s"] = %s;' % (k, js(v)))
    out.append(MARK_CLOSE)
    return '\n'.join(out) + '\n'

path = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '/eln/assets/env.js')
show = '--show' in sys.argv

if show:
    print(block())
    sys.exit(0)

if not os.path.isfile(path):
    sys.exit('Not found: ' + path + '  (pass the path to the deployed env.js)')

raw = open(path, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')

if MARK_OPEN in s:
    # Replace the block this script wrote before, so running it again updates the words
    # instead of leaving two sets where the later one silently wins.
    s = re.sub(re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE) + r'\n?', block(), s, count=1, flags=re.S)
    what = 'Updated'
else:
    if 'window["env"]' not in s and "window['env']" not in s:
        sys.exit(path + ' has no window["env"] assignments, so it is not the file this expects.'
                 ' Nothing was changed.')
    # At the END of the IIFE, not after the last window["env"] line: several of those
    # statements run over more than one line (the theme list is an array), and inserting
    # after the first line of one of them lands in the middle of it. Found the first time
    # the hard way, by a file that no longer parsed.
    close = list(re.finditer(r'^\s*\}\)\s*\(.*\)\s*;?\s*$', s, flags=re.M))
    at = close[-1].start() if close else len(s)
    s = s[:at] + '\n' + block() + '\n' + s[at:]
    what = 'Added to'

# This file is loaded by every page of the app before anything else runs: a syntax error in
# it is a white screen, not a wrong sentence. So it is checked before it is written, and a
# failed check changes nothing.
import subprocess, tempfile
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

if not os.path.exists(path + '.before-login-copy'):
    shutil.copyfile(path, path + '.before-login-copy')
open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print(what, path)
print('The bullet list changes on the next load of the sign-in page.')
print('The banner, tagline, title and note need the newer front end (baja 456c16c) built and deployed.')
