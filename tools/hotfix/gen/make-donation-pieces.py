#!/usr/bin/env python3
"""Regenerate the PIECES list inside tools/hotfix/install-donation-endpoint.py.

Reads the TypeScript slices in SRC (cut out of baja-server/src/index.ts) and their
compiled form in JSDIR, then writes one PIECES line into the installer. Everything
above and below that line is left exactly as it is.
"""
import hashlib, os, re, sys

# Where the slices and their compiled form live. They are cut out of baja-server's
# src/index.ts by hand (see the piece list below for the boundaries) and compiled by
# compile-piece.py, which puts the result in $PIECES/js7.
SRC = os.environ.get('PIECES', '/tmp/claude-0/donsrv')
JSDIR = os.path.join(SRC, 'js7')
INST = os.environ.get('INSTALLER',
                      os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                                   'install-donation-endpoint.py'))

FSHEAD = ("// fs and path under their own names: in dist/index.js the imports compile to\n"
          "// fs_1.default and path_1.default, so the bare bindings do not exist there.\n"
          "const fsx = require('fs'), pathx = require('path');\n")

# Stripe is imported in src/index.ts and compiles to stripe_1.default in dist, which the
# inserted block cannot see either. require() reaches the constructor in both shapes.
STRIPE_NEW = "new (require('stripe').Stripe || require('stripe'))("

PIECES = [
    # file, mark, wrap in an IIFE?, anchors
    ('p0', 'let __donationStripe', False, None),
    ('p1', "'/stripe/donation-session'", True, None),
    ('p2', "'/stripe/donation-sync'", True, None),
    ('p9', "'/campaigns.json'", True, None),
    ('p8', "'/fundraise/all-campaigns'", True, None),
    # The retire/restore/purge routes. No anchor: they are appended, and they reach the
    # directory cache that p9 owns through a global, because each piece lands inside its
    # own function in a built server and cannot see another piece's variables.
    ('p10', "'/fundraise/retire'", True, None),
    ('p3', "'/fundraise/campaigns'", True, None),
    ('p4', "'/stripe/donation-report'", True, None),
    ('p6', 'FUNDRAISE_OG_FALLBACK', True, None),
    ('p7', "'/stripe/payment-methods'", True, None),
    # p5 is the access middleware, and Express runs handlers in the order they were added,
    # so it has to land ABOVE every route it guards. all-campaigns is the topmost of those in
    # the file, which is why it is the first anchor: anchoring on /fundraise/campaigns put the
    # middleware below all-campaigns, and a non-admin could read every campaign on the box.
    ('p5', 'FUNDRAISE_ADMINS', True, ["app.post(['/fundraise/all-campaigns', '/api/fundraise/all-campaigns']",
                                      "app.post(['/fundraise/campaigns', '/api/fundraise/campaigns']",
                                      "app.post(['/stripe/donation-report', '/api/stripe/donation-report']"]),
]

def own_handles(js):
    """Give the block its own fs/path/Stripe, since the compiled file's are renamed."""
    needs = re.search(r'(?<![\w$.])(fs|path)\.', js)
    js = re.sub(r'(?<![\w$.])fs\.', 'fsx.', js)
    js = re.sub(r'(?<![\w$.])path\.', 'pathx.', js)
    js = js.replace('new Stripe(', STRIPE_NEW)
    if needs:
        js = FSHEAD + js
    return js

def wrap(t):
    body = '\n'.join(('    ' + l if l.strip() else l) for l in t.rstrip('\n').split('\n'))
    return '(function () {\n' + body + '\n})();\n'

out = []
for name, mark, do_wrap, anchors in PIECES:
    ts = open(os.path.join(SRC, name + '.ts'), encoding='utf-8').read()
    js = own_handles(open(os.path.join(JSDIR, name + '-tmp.js'), encoding='utf-8').read())
    if do_wrap:
        js = wrap(js)
    else:
        js = js.rstrip('\n') + '\n'
    for where, text in (('ts', ts), ('js', js)):
        if mark not in text:
            sys.exit('%s: the marker %r is not in its own %s. The installer would insert it twice.'
                     % (name, mark, where))
    ts = ts.rstrip('\n') + '\n'
    d = {
        'id': name,
        'mark': mark,
        'js': js,
        'ts': ts,
        'hash_js': hashlib.sha256(js.encode('utf-8')).hexdigest()[:8],
        'hash_ts': hashlib.sha256(ts.encode('utf-8')).hexdigest()[:8],
    }
    if anchors:
        d['anchors'] = anchors
    out.append(d)

# NOTHING MAY REACH ACROSS TWO PIECES.
#
# Each wrapped piece lands inside its own function in the built file, so a top-level
# declaration in one of them is invisible to all the others. From source every one of them
# is the same module and it all works, which is exactly what makes this worth checking by
# machine: the bug only exists on the deployed server. It cost one release, where sharing a
# campaign answered "FUNDRAISE_ADMINS is not defined" to anybody who pressed it.
#
# p0 is the exception by design: it is inserted unwrapped, at the top level, and is where a
# shared declaration belongs.
import re as _re2
DECL = _re2.compile(r'^(?: {4})?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', _re2.M)
def cross_piece_refs(out):
    # What each piece declares at its own top level. The wrapper indents the body by four,
    # so a piece's own top level is column 0 or column 4 and nothing deeper.
    # Comments mention names all the time, and a note explaining where something lives is
    # not a use of it. Strings are left in: a name inside one is usually a real reference.
    strip = lambda t: _re2.sub(r'//[^\n]*', '', _re2.sub(r'/\*.*?\*/', '', t, flags=_re2.S))
    code = {d['id']: strip(d['js']) for d in out}
    mine = {d['id']: set(DECL.findall(d['js'])) for d in out}
    shared = mine.get('p0', set())          # p0 is inserted unwrapped: its names are global
    bad = []
    for d in out:
        for other in out:
            if other['id'] == d['id'] or other['id'] == 'p0':
                continue
            for name in mine[other['id']]:
                # A name the using piece declares for itself (fsx, pathx and the like are
                # given to every piece that needs them) is not a reach across.
                if name in mine[d['id']] or name in shared or len(name) < 3:
                    continue
                if _re2.search(r'(?<![\w$.])' + _re2.escape(name) + r'(?![\w$])', code[d['id']]):
                    bad.append((d['id'], name, other['id']))
    return bad

_bad = cross_piece_refs(out)
if _bad:
    for who, name, owner in sorted(set(_bad)):
        print('%s uses %s, which %s declares inside its own wrapper.' % (who, name, owner))
    sys.exit('A piece cannot see another piece\'s declarations on a patched server. '
             'Move the declaration into p0, which is inserted at the top level.')

# EVERY BODY A PREVIOUS VERSION OF THIS INSTALLER INSERTED.
#
# Those went in without markers, so a later run cannot find them by id -- which is how a
# server ended up running an endpoint from a week ago while the installer reported that
# everything was already there. They are matched EXACTLY, byte for byte, which is the one
# way to delete code safely: the text either is what this installer wrote or it is not.
import subprocess
def legacy_bodies(current):
    # From the repository root, with the installer named relative to it: this walks the
    # installer's whole history, which is where the bodies previous versions inserted are
    # recovered from.
    root = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True,
                          cwd=os.path.dirname(INST)).stdout.strip()
    rel = os.path.relpath(os.path.abspath(INST), root)
    revs = subprocess.run(['git', 'log', '--format=%H', '--', rel],
                          capture_output=True, text=True, cwd=root).stdout.split()
    out = []
    for r in revs:
        blob = subprocess.run(['git', 'show', r + ':' + rel],
                              capture_output=True, text=True, cwd=root).stdout
        line = [l for l in blob.split('\n') if l.startswith('PIECES = [')]
        if not line:
            continue
        ns = {}
        try:
            exec(line[0], ns)
        except Exception:
            continue
        for piece in ns['PIECES']:
            for k in ('js', 'ts'):
                t = piece.get(k)
                if t and t not in current and t not in out:
                    out.append(t)
    return out

# The CURRENT bodies go in this list as well. A server patched before the markers existed
# has them sitting there unmarked, and a piece that has not changed since is exactly the
# case where nothing identifies it -- it would be inserted a second time rather than
# recognised. Matches inside a marked block are left alone by the remover.
LEGACY = legacy_bodies(set()) 
print('legacy bodies carried: %d (%d bytes)' % (len(LEGACY), sum(len(x) for x in LEGACY)))

whole = open(INST, encoding='utf-8', newline='').read()
if '\r\n' in whole:
    sys.exit('the installer has CRLF line endings; refusing to rewrite it')
at = whole.index('PIECES = [')
end = whole.index('\n', at) + 1
new = whole[:at] + 'PIECES = ' + repr(out) + '\n' + whole[end:]
# A lambda, not a replacement string: re.sub reads backslashes in the replacement, and
# repr() of this is nothing but backslash escapes.
import re as _re
new = _re.sub(r'^LEGACY = .*$', lambda m: 'LEGACY = ' + repr(LEGACY), new, count=1, flags=_re.M)
open(INST, 'w', encoding='utf-8', newline='').write(new)
print('wrote %d pieces, %d bytes' % (len(out), len(new)))
