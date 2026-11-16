"""Does the AI credit meter meter a paying subscriber?

    python3 py/tests/test_credit_meter_subscription.py

It used to. claude_usage._subscribed asked ion.works.has_active_subscription, which never
contacts Stripe: it looks for a marker file under $LJLSUBSCRIPTIONS. Nothing in either
repository sets that variable, and an unset variable read as False, so every user looked
unsubscribed and was refused at the $10 allowance -- inside python, before baja-server's gate
was consulted, which is why the server log showed subscribed=YES and no refusal at all.

The three states this asserts are the point: entitled, not entitled, and COULD NOT ASK. The
third must never meter anyone. A stub server stands in for baja-server so the could-not-ask
paths (a 500, a body without the field, nothing listening) can actually be exercised rather
than reasoned about.
"""
import importlib.util, io, json, os, sys, tempfile, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ion-lib'))
fails = []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

ANSWER = {'mode': 'active'}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        m = ANSWER['mode']
        if m == 'down':
            self.send_response(500); self.end_headers(); self.wfile.write(b'{}'); return
        if m == 'garbage':
            self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
            self.wfile.write(b'{"unexpected":true}'); return
        body = json.dumps({'active': m in ('active', 'trialing', 'paid', 'comp'), 'status': m}).encode()
        self.send_response(200); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

srv = HTTPServer(('127.0.0.1', 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ['SERVER_BASE_URL'] = 'http://127.0.0.1:%d' % srv.server_address[1]

import claude_usage as cu
from ion import works as w

def fresh():
    cu._ENT_CACHE.clear()

# the reported case: no marker directory anywhere
os.environ.pop('LJLSUBSCRIPTIONS', None)
ok(w.subscription_marker('a@b.com') is None, 'an unset marker directory says it CANNOT answer, not no')
ok(w.has_active_subscription('a@b.com') is False, 'the bool wrapper still reads that as False')

ANSWER['mode'] = 'active'; fresh()
ok(cu._subscribed('a@b.com') is True, 'A SUBSCRIBER IS NOT METERED, with no marker file at all')
ANSWER['mode'] = 'comp'; fresh()
ok(cu._subscribed('a@b.com') is True, 'and a comp counts the same way')
ANSWER['mode'] = 'none'; fresh()
ok(cu._subscribed('a@b.com') is False, 'a definite no from the server still meters')

# server unreachable, no marker directory: fail OPEN, as the comment promises
os.environ['SERVER_BASE_URL'] = 'http://127.0.0.1:1'
fresh()
ok(cu._subscribed('a@b.com') is True, 'server unreachable and nothing else to ask: not metered')

# server unreachable, marker directory present and says no
d = tempfile.mkdtemp()
os.environ['LJLSUBSCRIPTIONS'] = d
fresh()
ok(w.subscription_marker('a@b.com') is False, 'a present marker directory with no file is a real no')
ok(cu._subscribed('a@b.com') is False, 'server unreachable but the marker answers no: metered')

# ... and says yes
io.open(os.path.join(d, 'a@b.com_d%s' % (date.today() + timedelta(days=30))), 'w').write('x')
fresh()
ok(w.subscription_marker('a@b.com') is True, 'a future-dated marker grants')
ok(cu._subscribed('a@b.com') is True, 'and the meter honours it')

# an expired marker is not a grant
import shutil; shutil.rmtree(d); d = tempfile.mkdtemp(); os.environ['LJLSUBSCRIPTIONS'] = d
io.open(os.path.join(d, 'a@b.com_d%s' % (date.today() - timedelta(days=1))), 'w').write('x')
fresh()
ok(w.subscription_marker('a@b.com') is False, 'a past-dated marker does not grant')

# a 500 and a malformed body are both "could not ask", not "no"
os.environ['SERVER_BASE_URL'] = 'http://127.0.0.1:%d' % srv.server_address[1]
shutil.rmtree(d); os.environ.pop('LJLSUBSCRIPTIONS', None)
ANSWER['mode'] = 'down'; fresh()
ok(cu._server_entitlement('a@b.com') is None, 'a 500 is could-not-ask')
ok(cu._subscribed('a@b.com') is True, 'and does not meter')
ANSWER['mode'] = 'garbage'; fresh()
ok(cu._server_entitlement('a@b.com') is None, 'a body without the field is could-not-ask')
ok(cu._subscribed('a@b.com') is True, 'and does not meter')

# allowance() must not block a subscriber
ANSWER['mode'] = 'active'; fresh()
a = cu.allowance('a@b.com')
ok(a['subscribed'] is True and a['blocked'] is False, 'allowance reports a subscriber unblocked')
ANSWER['mode'] = 'none'; fresh()
a = cu.allowance('a@b.com')
ok(a['subscribed'] is False, 'and a free user as not subscribed')

# the meter must never raise
ANSWER['mode'] = 'active'
try:
    cu._subscribed(None); cu.allowance(None); raised = False
except Exception as e:
    raised = True
ok(not raised, 'nothing here raises, even on a None address')

print('\n' + ('all assertions passed' if not fails else '%d FAILED' % len(fails)))
sys.exit(1 if fails else 0)
