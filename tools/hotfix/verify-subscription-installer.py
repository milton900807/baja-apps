"""Verify install-subscription-entitlement.py against every state the server could be in.

    python3 verify-subscription-installer.py            # fixtures already built
    python3 verify-subscription-installer.py --build    # build them from git first

WHY THIS EXISTS. Three separate times this installer was shipped with something unverified:
bodies transcribed instead of taken from the build, a marker shared with the previous
version so a stale server reported "already installed", and a marker edit that silently did
not apply at all. Each was invisible by inspection and obvious to an assertion. So the
assertions live here.

It builds the dist of every version of baja-server this installer might meet, runs the
installer against each, and checks that the marker was absent beforehand (or "already" would
be a lie), that the functions AND the route were replaced, that what landed is
byte-identical to what tsc produces, that the result parses, that nothing is duplicated,
and that a second run changes nothing.
"""
import io, os, re, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
APPS = os.path.dirname(os.path.dirname(HERE))
SERVER = os.environ.get('BAJA_SERVER', os.path.join(os.path.dirname(APPS), 'baja-server'))
S = os.environ.get('FIXTURES', os.path.join(tempfile.gettempdir(), 'entitlement-fixtures'))
I = os.path.join(HERE, 'install-subscription-entitlement.py')

# Every shape of the server this installer might meet, oldest first. A new revision adds its
# own commit here, because the state it has to replace is the one before it.
STATES = [
    ('pristine', 'e74e717'),   # before any of this: subscriptionSource alone
    ('patched', '74bb5be'),    # entitlement unified, single customer
    ('v2', '52e8e82'),         # every customer at the address
    ('v3', 'bad8259'),         # comps, before the route was fixed
]


def build_fixtures():
    for name, ref in STATES:
        d = os.path.join(S, name, 'dist')
        if os.path.isdir(os.path.join(S, name)):
            shutil.rmtree(os.path.join(S, name))
        os.makedirs(d)
        subprocess.run(['git', 'stash', '-u'], cwd=SERVER, capture_output=True)
        subprocess.run(['git', 'checkout', '-q', ref], cwd=SERVER, check=True)
        subprocess.run(['npm', 'run', 'build'], cwd=SERVER, capture_output=True, check=True)
        shutil.copy(os.path.join(SERVER, 'dist', 'index.js'), os.path.join(d, 'index.js'))
        print('  built %-9s <- %s' % (name, ref))
    subprocess.run(['git', 'checkout', '-q', 'main'], cwd=SERVER, check=True)
    subprocess.run(['git', 'stash', 'pop'], cwd=SERVER, capture_output=True)
    subprocess.run(['npm', 'run', 'build'], cwd=SERVER, capture_output=True, check=True)
src = io.open(I, encoding='utf-8').read()
MARK = re.search(r"^MARK = '([^']+)'", src, re.M).group(1)
REAL = os.path.join(SERVER, 'dist', 'index.js')

if '--build' in sys.argv:
    build_fixtures()

def grab(text, decl, closing=')'):
    k = text.index(decl); i = text.index('{', k); d = 0; j = i
    while True:
        c = text[j]
        if c == '{': d += 1
        elif c == '}':
            d -= 1
            if d == 0: break
        j += 1
    return text[k:j+1]

fails = []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

real = io.open(REAL, encoding='utf-8').read()
want = {n: grab(real, 'async function %s(' % n).strip() for n in ('stripeEntitlement', 'subscriptionSource')}
ROUTE = "app.get(['/stripe/subscription-status', '/api/stripe/subscription-status']"
want['route'] = grab(real, ROUTE).strip()

for st, _ref in STATES:
    f = os.path.join(S, st, 'dist', 'index.js')
    before = io.open(f, encoding='utf-8').read()
    print('\n=== %s ===' % st)
    ok(MARK not in before, 'the marker is ABSENT before installing (so "already" cannot be wrong)')
    out = subprocess.run([sys.executable, '-I', I, os.path.join(S, st)],
                         capture_output=True, text=True).stdout
    ok('dist/index.js  : patched   (status route: patched)' in out,
       'first run patches the functions AND the route')
    after = io.open(f, encoding='utf-8').read()
    ok(MARK in after, 'and the marker is present afterwards')
    for n, body in want.items():
        ok(grab(after, 'async function %s(' % n if n != 'route' else ROUTE).strip() == body,
           '%s is byte-identical to the real build' % n)
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    ok(r.returncode == 0, 'the result parses')
    ok(after.count(ROUTE) == 1, 'exactly one status route registration remains')
    ok(after.count('async function subscriptionSource(') == 1, 'exactly one subscriptionSource remains')
    ok('customers.list({ email, limit: 1 })' not in grab(after, ROUTE),
       'the route no longer reads only the first customer')
    out2 = subprocess.run([sys.executable, '-I', I, os.path.join(S, st)],
                          capture_output=True, text=True).stdout
    ok('already' in out2, 'a second run reports already and changes nothing')
    ok(io.open(f, encoding='utf-8').read() == after, 'and the file is untouched by it')

print('\n' + ('ALL STATES VERIFIED' if not fails else '%d FAILED' % len(fails)))
sys.exit(1 if fails else 0)
