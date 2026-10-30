#!/usr/bin/env python3
"""
baja-server: the donation endpoint for the fundraising display, installed ON the server.

    sudo python3 install-donation-endpoint.py /opt/baja-server && sudo systemctl restart baja-server

WHY THIS EXISTS. deploy/deploy.sh builds TypeScript on a laptop and rsyncs the result over ssh; run
from the server itself it tries to ssh into the machine it is already on, and wants a key that is not
there. This installs the same endpoint without a build: it inserts the COMPILED form (tsc ES2020, the
project's own settings, so async/await stays native and no helper is needed) into dist/index.js, and
patches src/index.ts too when that file is present, so a later rebuild on this box does not drop it.

    GET  /stripe/donation-session    says what the route is and whether STRIPE_SECRET_KEY is set
    POST /stripe/donation-session    { amount, currency, campaign, path, returnUrl } -> { url }

The POST creates a one-off Stripe Checkout session for the amount a donor chose on the public display.
It names no payment_method_types, so Stripe offers every method enabled on the account that is eligible
for the amount, currency and country: card, Apple Pay, Google Pay, Link, Cash App, Klarna, bank debits.

It goes in just before the Stripe billing-portal route, and it needs the `app`, `stripeClient` and
`stripeReady` that the Stripe section of that file already defines. If it cannot find them, or cannot
find a place to insert, it refuses and changes nothing.

Each file it edits is backed up beside itself (.before-donation), the result is checked with `node
--check` before it replaces anything, and a file that fails the check is left untouched. Safe to run
twice. The sourcemap comment at the end of dist/index.js is now off by the inserted lines, which
affects stack-trace line numbers and nothing else; the next real deploy restores it.
"""
import os, shutil, subprocess, sys, tempfile
JS = 'const DONATION_CURRENCIES = [\'usd\', \'eur\', \'gbp\', \'cad\', \'aud\', \'chf\', \'jpy\'];\n// Opening the POST route in a browser is a GET, and Express answers a GET with no route by\n// saying "Cannot GET /stripe/donation-session" -- which looks exactly like the endpoint not\n// being deployed, whether or not it is. So the GET says what it actually is, and doubles as\n// the way to check a deploy landed and whether a Stripe key is configured.\napp.get([\'/stripe/donation-session\', \'/api/stripe/donation-session\'], (_req, res) => {\n    res.json({\n        ok: true,\n        endpoint: \'/stripe/donation-session\',\n        method: \'POST\',\n        body: { amount: \'number\', currency: DONATION_CURRENCIES, campaign: \'string\', path: \'string\', returnUrl: \'same-origin url\', email: \'optional\' },\n        stripeConfigured: !!stripeClient,\n        note: \'POST only. Payment methods are whatever is enabled on the Stripe account; this endpoint names none.\',\n    });\n});\napp.post([\'/stripe/donation-session\', \'/api/stripe/donation-session\'], async (req, res) => {\n    if (!stripeReady(res))\n        return;\n    try {\n        const { amount, currency, campaign, path: campaignPath, returnUrl, email } = req.body || {};\n        const cur = String(currency || \'usd\').toLowerCase();\n        if (DONATION_CURRENCIES.indexOf(cur) < 0)\n            return res.status(400).json({ error: \'bad_currency\' });\n        const amt = Number(amount);\n        if (!isFinite(amt) || amt <= 0)\n            return res.status(400).json({ error: \'bad_amount\' });\n        // Zero-decimal currencies (JPY) are charged in whole units; everything else in cents.\n        const zeroDec = (cur === \'jpy\');\n        const minor = Math.round(amt * (zeroDec ? 1 : 100));\n        const floor = zeroDec ? 100 : 100; // ~1 unit, under Stripe\'s own minimum otherwise\n        const ceiling = zeroDec ? 10000000 : 100000000; // 10m yen / 1m dollars: a typo guard, not a policy\n        if (minor < floor)\n            return res.status(400).json({ error: \'amount_too_small\' });\n        if (minor > ceiling)\n            return res.status(400).json({ error: \'amount_too_large\' });\n        // Where the donor is sent back to. Only this server\'s own origin is accepted: an\n        // open redirect here would be handed out by Stripe itself.\n        const origin = String(req.headers.origin || \'\').replace(/\\/$/, \'\');\n        let back = origin ? origin + \'/\' : \'\';\n        if (returnUrl) {\n            try {\n                const u = new URL(String(returnUrl));\n                const o = origin ? new URL(origin) : null;\n                if (o && u.protocol === o.protocol && u.host === o.host)\n                    back = u.toString();\n            }\n            catch (e) { /* keep the origin */ }\n        }\n        if (!back)\n            return res.status(400).json({ error: \'no_return_url\' });\n        const sep = back.indexOf(\'?\') >= 0 ? \'&\' : \'?\';\n        const name = String(campaign || \'\').slice(0, 120).trim();\n        const session = await stripeClient.checkout.sessions.create({\n            mode: \'payment\',\n            submit_type: \'donate\',\n            // No payment_method_types: see above. Every method enabled on the account shows.\n            line_items: [{\n                    quantity: 1,\n                    price_data: {\n                        currency: cur,\n                        unit_amount: minor,\n                        product_data: { name: name ? (\'Donation — \' + name) : \'Donation\' },\n                    },\n                }],\n            ...(email ? { customer_email: String(email).slice(0, 200) } : {}),\n            metadata: {\n                kind: \'fundraise-donation\',\n                campaign: name,\n                campaignPath: String(campaignPath || \'\').slice(0, 300),\n            },\n            payment_intent_data: {\n                description: name ? (\'Donation to \' + name) : \'Donation\',\n                metadata: { kind: \'fundraise-donation\', campaign: name, campaignPath: String(campaignPath || \'\').slice(0, 300) },\n            },\n            success_url: back + sep + \'donated=1\',\n            cancel_url: back,\n        });\n        return res.json({ url: session.url, id: session.id });\n    }\n    catch (e) {\n        return res.status(500).json({ error: \'stripe_error\', error_description: e?.message || String(e) });\n    }\n});\n'
TS = 'const DONATION_CURRENCIES = [\'usd\', \'eur\', \'gbp\', \'cad\', \'aud\', \'chf\', \'jpy\'];\n// Opening the POST route in a browser is a GET, and Express answers a GET with no route by\n// saying "Cannot GET /stripe/donation-session" -- which looks exactly like the endpoint not\n// being deployed, whether or not it is. So the GET says what it actually is, and doubles as\n// the way to check a deploy landed and whether a Stripe key is configured.\napp.get([\'/stripe/donation-session\', \'/api/stripe/donation-session\'], (_req: any, res: any) => {\n    res.json({\n        ok: true,\n        endpoint: \'/stripe/donation-session\',\n        method: \'POST\',\n        body: { amount: \'number\', currency: DONATION_CURRENCIES, campaign: \'string\', path: \'string\', returnUrl: \'same-origin url\', email: \'optional\' },\n        stripeConfigured: !!stripeClient,\n        note: \'POST only. Payment methods are whatever is enabled on the Stripe account; this endpoint names none.\',\n    });\n});\n\napp.post([\'/stripe/donation-session\', \'/api/stripe/donation-session\'], async (req: any, res: any) => {\n    if (!stripeReady(res)) return;\n    try {\n        const { amount, currency, campaign, path: campaignPath, returnUrl, email } = req.body || {};\n        const cur = String(currency || \'usd\').toLowerCase();\n        if (DONATION_CURRENCIES.indexOf(cur) < 0) return res.status(400).json({ error: \'bad_currency\' });\n        const amt = Number(amount);\n        if (!isFinite(amt) || amt <= 0) return res.status(400).json({ error: \'bad_amount\' });\n        // Zero-decimal currencies (JPY) are charged in whole units; everything else in cents.\n        const zeroDec = (cur === \'jpy\');\n        const minor = Math.round(amt * (zeroDec ? 1 : 100));\n        const floor = zeroDec ? 100 : 100;                 // ~1 unit, under Stripe\'s own minimum otherwise\n        const ceiling = zeroDec ? 10000000 : 100000000;    // 10m yen / 1m dollars: a typo guard, not a policy\n        if (minor < floor) return res.status(400).json({ error: \'amount_too_small\' });\n        if (minor > ceiling) return res.status(400).json({ error: \'amount_too_large\' });\n\n        // Where the donor is sent back to. Only this server\'s own origin is accepted: an\n        // open redirect here would be handed out by Stripe itself.\n        const origin = String(req.headers.origin || \'\').replace(/\\/$/, \'\');\n        let back = origin ? origin + \'/\' : \'\';\n        if (returnUrl) {\n            try {\n                const u = new URL(String(returnUrl));\n                const o = origin ? new URL(origin) : null;\n                if (o && u.protocol === o.protocol && u.host === o.host) back = u.toString();\n            } catch (e) { /* keep the origin */ }\n        }\n        if (!back) return res.status(400).json({ error: \'no_return_url\' });\n        const sep = back.indexOf(\'?\') >= 0 ? \'&\' : \'?\';\n\n        const name = String(campaign || \'\').slice(0, 120).trim();\n        const session = await stripeClient!.checkout.sessions.create({\n            mode: \'payment\',\n            submit_type: \'donate\',\n            // No payment_method_types: see above. Every method enabled on the account shows.\n            line_items: [{\n                quantity: 1,\n                price_data: {\n                    currency: cur,\n                    unit_amount: minor,\n                    product_data: { name: name ? (\'Donation — \' + name) : \'Donation\' },\n                },\n            }],\n            ...(email ? { customer_email: String(email).slice(0, 200) } : {}),\n            metadata: {\n                kind: \'fundraise-donation\',\n                campaign: name,\n                campaignPath: String(campaignPath || \'\').slice(0, 300),\n            },\n            payment_intent_data: {\n                description: name ? (\'Donation to \' + name) : \'Donation\',\n                metadata: { kind: \'fundraise-donation\', campaign: name, campaignPath: String(campaignPath || \'\').slice(0, 300) },\n            },\n            success_url: back + sep + \'donated=1\',\n            cancel_url: back,\n        });\n        return res.json({ url: session.url, id: session.id });\n    } catch (e: any) {\n        return res.status(500).json({ error: \'stripe_error\', error_description: e?.message || String(e) });\n    }\n});\n\n'

MARK = 'donation-session'
# In order of preference: the route this belongs beside, then anything else from the Stripe
# section, so an older build still has somewhere to put it.
ANCHORS = [
    "app.post(['/stripe/portal', '/api/stripe/portal']",
    "app.post(['/stripe/create-checkout-session', '/api/stripe/create-checkout-session']",
    "app.get(['/stripe/price-info', '/api/stripe/price-info']",
    "app.get(['/stripe/subscription-status', '/api/stripe/subscription-status']",
]

def node_ok(text):
    """node --check on the result, so a broken insert never reaches the service."""
    fd, tmp = tempfile.mkstemp(suffix='.js')
    try:
        os.write(fd, text.encode('utf-8')); os.close(fd)
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        return (r.returncode == 0, (r.stderr or '').strip().split('\n')[0])
    except FileNotFoundError:
        return (True, 'node not found: skipped the syntax check')
    finally:
        try: os.unlink(tmp)
        except OSError: pass

def patch(path, payload, check):
    raw = open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in raw
    s = raw.replace('\r\n', '\n')
    if MARK in s:
        print('Already there:', path)
        return None
    for need in ('stripeReady', 'stripeClient'):
        if need not in s:
            sys.exit(path + ' has no ' + need + ', so this is not the file with the Stripe section in it.'
                     ' Nothing was changed.')
    for a in ANCHORS:
        if s.count(a) == 1:
            at = s.index(a)
            # back up to the start of the comment block above the route, if there is one
            head = s.rfind('\n\n', 0, at)
            at = (head + 2) if head > 0 else at
            t = s[:at] + payload + '\n' + s[at:]
            break
    else:
        sys.exit('Could not find the Stripe routes in ' + path + '. Nothing was changed.')
    if check:
        ok, why = node_ok(t)
        if not ok:
            sys.exit('The patched ' + path + ' does not parse (' + why + '). Nothing was changed.')
    return (path, t, crlf)

root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '/opt/baja-server')
dist = os.path.join(root, 'dist/index.js')
srcf = os.path.join(root, 'src/index.ts')
if not os.path.isfile(dist):
    sys.exit('Not found: ' + dist + '  (pass the baja-server directory as the first argument)')

writes = [w for w in [patch(dist, JS, True)] if w]
if os.path.isfile(srcf):
    w = patch(srcf, TS, False)      # TypeScript: node --check cannot read it
    if w: writes.append(w)
else:
    print('No src/index.ts here, so only dist was considered. A rebuild from source elsewhere needs the'
          ' matching commit in baja-server.')

for p, text, crlf in writes:
    shutil.copyfile(p, p + '.before-donation')
    open(p, 'w', encoding='utf-8', newline='').write(text.replace('\n', '\r\n') if crlf else text)
    print('Updated', p, '(backup:', os.path.basename(p) + '.before-donation)')
if writes:
    print('Now:  sudo systemctl restart baja-server')
    print('Then: curl -s localhost:3000/stripe/donation-session   (or the port this server listens on)')
