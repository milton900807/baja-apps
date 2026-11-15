#!/usr/bin/env python3
"""
What does Stripe actually hold at one email address? Read-only, run ON the server.

    sudo python3 stripe-whats-there.py you@example.com [/opt/baja-server]

WHY THIS EXISTS. The entitlement fix answers "is this person entitled" correctly now,
including when their payment sits on a second customer record. It cannot answer the question
underneath a "no": is there a payment anywhere at this address at all? Those are different
answers with different remedies -- a code defect versus a billing record that does not exist
-- and guessing between them is how an account gets let through on a hunch. This prints what
is there and nothing else.

IT CHANGES NOTHING. Three GETs: customers at the address, then each customer's subscriptions
and Checkout sessions. No writes, no refunds, no comps.

THE SECRET IS NOT PUT ON A COMMAND LINE. The key is read out of the server's own .env, held
in memory, and sent in a header. It is never an argument (arguments are world-readable in
ps), never echoed, and never logged; only its last four characters are printed, so you can
tell which key answered without the key leaving the box.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.stripe.com/v1/'


def read_key(root):
    """The live key out of the server's own .env, so this reads what the service reads."""
    path = os.path.join(root, '.env')
    if not os.path.exists(path):
        return None, path + ' does not exist'
    with open(path, 'r', encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line.startswith('#') or '=' not in line:
                continue
            name, _, value = line.partition('=')
            if name.strip() in ('STRIPE_SECRET_KEY', 'STRIPE_API_KEY', 'STRIPE_KEY'):
                return value.strip().strip('"').strip("'"), None
    return None, 'no STRIPE_SECRET_KEY in ' + path


def get(key, path, params):
    url = API + path + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')[:300]
        return None, 'HTTP %s: %s' % (e.code, body)
    except Exception as e:                                  # noqa: BLE001
        return None, str(e)


def when(ts):
    if not ts:
        return '?'
    return time.strftime('%Y-%m-%d', time.gmtime(ts))


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip().split('\n')[2].strip())
        return 2
    email = sys.argv[1].strip().lower()
    root = sys.argv[2] if len(sys.argv) > 2 else '/opt/baja-server'

    key, why = read_key(root)
    if not key:
        print('No Stripe key: ' + why)
        return 2
    print('key ...%s   address %s\n' % (key[-4:], email))

    cs, err = get(key, 'customers', {'email': email, 'limit': 20})
    if err:
        print('customers: ' + err)
        return 1
    rows = cs.get('data') or []
    if not rows:
        print('NO CUSTOMER AT THIS ADDRESS. Nothing has ever been billed to it, under this')
        print('key. Check the key is the live one and the address is the one used at')
        print('checkout (a different address at checkout makes a different customer).')
        return 0
    print('%d customer record(s) at this address:' % len(rows))

    now = int(time.time())
    entitling = []
    for c in rows:
        cid = c.get('id')
        print('\n  %s   created %s' % (cid, when(c.get('created'))))

        subs, err = get(key, 'subscriptions', {'customer': cid, 'status': 'all', 'limit': 20})
        if err:
            print('    subscriptions: ' + err)
        else:
            data = subs.get('data') or []
            if not data:
                print('    subscriptions: none')
            for s in data:
                st = s.get('status')
                print('    subscription %s  %s  period ends %s'
                      % (s.get('id'), st, when(s.get('current_period_end'))))
                if st in ('active', 'trialing'):
                    entitling.append('subscription %s on %s' % (st, cid))

        ss, err = get(key, 'checkout/sessions', {'customer': cid, 'limit': 100})
        if err:
            print('    checkout sessions: ' + err)
        else:
            data = ss.get('data') or []
            if not data:
                print('    checkout sessions: none')
            for s in data:
                mode, st, pay = s.get('mode'), s.get('status'), s.get('payment_status')
                created = s.get('created')
                note = ''
                if mode == 'payment' and st == 'complete' and pay == 'paid' and created:
                    exp = created + 365 * 24 * 3600
                    note = '  -> early-access year, ' + (
                        'valid to ' + when(exp) if exp > now else 'EXPIRED ' + when(exp))
                    if exp > now:
                        entitling.append('paid checkout on %s, to %s' % (cid, when(exp)))
                print('    checkout %s  mode=%s status=%s payment=%s  %s%s'
                      % (s.get('id'), mode, st, pay, when(created), note))

    print('\n' + ('ENTITLED by: ' + '; '.join(entitling) if entitling else
                  'NOTHING HERE ENTITLES THIS ADDRESS.'))
    if not entitling:
        print('Every record above was read, so this is not the duplicate-customer defect.')
        print('There is no qualifying payment at this address under this key. Granting')
        print('access anyway is a billing decision, not a bug fix. Two honest routes:')
        print('  - create a comp subscription on this customer in Stripe; nothing to deploy;')
        print('  - or name the address in BAJA_ENTITLED on the server and restart, which')
        print('    reports status "comp" so it is never counted as a sale.')
        print('Neither invents a payment. Inventing one is the option that is not on offer.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
