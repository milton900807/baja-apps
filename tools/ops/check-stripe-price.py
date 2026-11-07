#!/usr/bin/env python3
"""
Why Stripe says "No such price", and what the account actually has.

    sudo python3 check-stripe-price.py                        # look
    sudo python3 check-stripe-price.py --set price_1ABC...    # set STRIPE_PRICE_ID to that

A price belongs to ONE Stripe account AND one mode. "No such price: price_..." means the key
the server is using cannot see that price: either the key now belongs to a different account,
or the key is live and the price is a test price (or the other way round). Changing the secret
key without changing STRIPE_PRICE_ID produces exactly this.

It reads /opt/baja-server/.env, asks Stripe what it can see, and prints what it found. The key
is never printed: only its last four characters, its mode, and whether Stripe accepted it. The
key goes to Stripe in a header, which is the one place it belongs, and to nowhere else.

With --set it writes STRIPE_PRICE_ID, keeping every other line, after checking that the price
really exists on this account and in this mode. Restart baja-server afterwards.
"""
import json, os, re, sys, urllib.error, urllib.request

ENV = os.environ.get('BAJA_ENV_FILE', '/opt/baja-server/.env')
API = os.environ.get('STRIPE_API', 'https://api.stripe.com')

def read_env(path):
    if not os.path.isfile(path):
        sys.exit('Not found: ' + path + '  (set BAJA_ENV_FILE to point at it)')
    out, raw = {}, open(path, encoding='utf-8', errors='replace').read()
    for line in raw.replace('\r\n', '\n').split('\n'):
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, v = s.split('=', 1)
        k = k.strip()
        if k.startswith('export '):
            k = k[len('export '):]
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out, raw

def api(key, path):
    req = urllib.request.Request(API + path, headers={'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode('utf-8'))
        except Exception: return e.code, {}
    except Exception as e:
        sys.exit('Could not reach Stripe: ' + str(e))

env, raw = read_env(ENV)
key = env.get('STRIPE_SECRET_KEY', '')
pid = env.get('STRIPE_PRICE_ID', '')
if not key:
    sys.exit('There is no STRIPE_SECRET_KEY in ' + ENV + '.')

mode = 'live' if '_live_' in key else ('test' if '_test_' in key else 'unknown')
print('Key           …' + key[-4:] + '   (' + mode + ' by its prefix)')

st, acct = api(key, '/v1/account')
if st == 401:
    sys.exit('Stripe rejected this key (401). Nothing else below would mean anything.')
print('Account       ' + str(acct.get('id', '?')) + '   ' + str(acct.get('business_profile', {}).get('name') or acct.get('settings', {}).get('dashboard', {}).get('display_name') or ''))

# THE DONATION KEY IS A DIFFERENT ACCOUNT, AND THAT IS THE POINT. Donations run on
# STRIPE_DONATION_SECRET_KEY; the subscription price above belongs to STRIPE_SECRET_KEY.
# One key in both places is what makes a price "not found", so this says plainly which
# account each one is.
dkey = env.get('STRIPE_DONATION_SECRET_KEY', '')
print('')
if not dkey:
    print('Donations     no STRIPE_DONATION_SECRET_KEY, so donations fall back to the key above.')
    print('              That is the old behaviour. To give donations their own account:')
    print('              sudo bash set-stripe-key.sh --donations')
elif dkey == key:
    print('Donations     THE SAME KEY as the subscription. If they are meant to be two accounts,')
    print('              set the donation key:  sudo bash set-stripe-key.sh --donations')
else:
    dmode = 'live' if '_live_' in dkey else ('test' if '_test_' in dkey else 'unknown')
    dst, dacct = api(dkey, '/v1/account')
    if dst == 401:
        print('Donations     key …' + dkey[-4:] + ' (' + dmode + ')   STRIPE REJECTED IT (401). Donations will fail.')
    else:
        print('Donations     key …' + dkey[-4:] + ' (' + dmode + ')   account ' + str(dacct.get('id', '?'))
              + '   ' + str(dacct.get('business_profile', {}).get('name')
                            or dacct.get('settings', {}).get('dashboard', {}).get('display_name') or ''))
    if dmode != mode and 'unknown' not in (dmode, mode):
        print('              NOTE: one key is ' + mode + ' and the other ' + dmode + '. That is allowed, but')
        print('              it means one of the two is not taking real money.')

# Has the key changed recently? The fundraising setup script keeps the previous .env.
old = ENV + '.before-fundraise'
if os.path.isfile(old):
    try:
        prev = read_env(old)[0].get('STRIPE_SECRET_KEY', '')
        if prev and prev != key:
            print('')
            print('NOTE: the key changed. ' + os.path.basename(old) + ' has a different one, ending …' + prev[-4:] + '.')
            print('      A price belongs to one account, so a price id from the old key will not resolve')
            print('      under the new one. Either set a price from this account (below), or put the old')
            print('      key back if subscriptions are meant to run on that account.')
    except Exception:
        pass

print('')
if not pid:
    print('STRIPE_PRICE_ID is not set, so subscriptions have no price to use.')
else:
    st, price = api(key, '/v1/prices/' + pid)
    if st == 200:
        amt = price.get('unit_amount')
        print('STRIPE_PRICE_ID ' + pid + '  EXISTS: '
              + (str(amt / 100.0) + ' ' + str(price.get('currency', '')).upper() if amt is not None else 'no fixed amount')
              + ('  recurring ' + str((price.get('recurring') or {}).get('interval', '')) if price.get('recurring') else '  one-time')
              + ('  active' if price.get('active') else '  INACTIVE (Stripe will refuse it)'))
    else:
        print('STRIPE_PRICE_ID ' + pid + '  NOT ON THIS ACCOUNT/MODE. This is the error you saw.')

print('')
st, lst = api(key, '/v1/prices?active=true&limit=20&expand[]=data.product')
rows = (lst or {}).get('data', []) if st == 200 else []
if not rows:
    print('This account has no active prices at all, so nothing here can be subscribed to yet.')
    print('Create one in the Stripe dashboard (Product catalogue), then re-run with --set <price id>.')
else:
    print('Active prices on this account (' + mode + '):')
    for p in rows:
        prod = p.get('product')
        name = prod.get('name') if isinstance(prod, dict) else str(prod or '')
        amt = p.get('unit_amount')
        money = (('%.2f' % (amt / 100.0)) + ' ' + str(p.get('currency', '')).upper()) if amt is not None else 'customer chooses'
        rec = (p.get('recurring') or {}).get('interval')
        print('  ' + p.get('id', '') + '  ' + money + ('/' + rec if rec else ' one-time') + '   ' + str(name or ''))

want = None
if '--set' in sys.argv:
    i = sys.argv.index('--set')
    want = sys.argv[i + 1] if len(sys.argv) > i + 1 else None
if not want:
    print('')
    print('To point the server at one of these:  sudo python3 ' + os.path.basename(__file__) + ' --set <price id>')
    sys.exit(0)

st, price = api(key, '/v1/prices/' + want)
if st != 200:
    sys.exit('Stripe does not have ' + want + ' on this account and mode. Nothing was changed.')
if not price.get('active'):
    sys.exit(want + ' exists but is not active, so checkout would refuse it. Nothing was changed.')

# Replace the line, keep the rest, and never widen the file's permissions.
import shutil
lines, done = raw.replace('\r\n', '\n').split('\n'), False
for n, line in enumerate(lines):
    if re.match(r'\s*(export\s+)?STRIPE_PRICE_ID\s*=', line):
        lines[n] = 'STRIPE_PRICE_ID=' + want
        done = True
        break
if not done:
    while lines and not lines[-1].strip():
        lines.pop()
    lines.append('STRIPE_PRICE_ID=' + want)
out = '\n'.join(lines).rstrip('\n') + '\n'
if not os.path.exists(ENV + '.before-price'):
    shutil.copyfile(ENV, ENV + '.before-price')
    os.chmod(ENV + '.before-price', 0o600)
open(ENV, 'w', encoding='utf-8').write(out)
os.chmod(ENV, 0o600)
print('')
print('STRIPE_PRICE_ID is now ' + want + ' in ' + ENV + '  (previous file: ' + os.path.basename(ENV) + '.before-price)')
print('Now: sudo systemctl restart baja-server')
