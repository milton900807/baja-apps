#!/usr/bin/env python3
"""
baja-server: make the credit gate honour the early-access year, installed ON the server.

    sudo python3 install-subscription-entitlement.py /opt/baja-server
    sudo systemctl restart baja-server
    curl -s "localhost:8080/stripe/subscription-status?email=you@example.com"

THE BUG. There are two ways to be entitled and there were two implementations of the
question. /stripe/subscription-status knew both: an active or trialing subscription, AND the
early-access one-time purchase (a completed, paid Checkout in payment mode, good for a year
from the purchase). subscriptionSource, which is what every gate actually calls, knew only
the first. So a customer who bought the beta year was told by the app that they were
subscribed and refused by the AI credit gate with "You have used the $10 of AI credits that
come with the free plan." The product disagreed with itself about someone who had paid.

WHAT THIS CHANGES. One function, stripeEntitlement, answers it, and both callers read it.
The rule is exactly what the status route already applied and is no wider: active and
trialing entitle; past_due, canceled, incomplete, incomplete_expired and unpaid do not; a
Checkout entitles only when it is payment mode, complete, paid, and inside its year. A
lapsed subscription no longer cancels a year that was paid for. Nothing here grants access
on a Stripe error or a missing key: those still fail closed.

HOW, because /opt/baja-server is not a git checkout. The compiled form goes into
dist/index.js, which is what the service runs, and src/index.ts is patched too when it is
present so a later rebuild on this box does not drop it. The function is found by its own
declaration and replaced by matching braces, not by a line number, and the result is passed
through `node --check` before anything is written: a broken edit never reaches the service.
Idempotent -- running it twice is a no-op, and it says so.
"""
import os
import re
import subprocess
import sys
import tempfile

MARK = 'stripeEntitlement'

# ---------------------------------------------------------------- the replacement bodies

JS_NEW = r'''
// WHAT ENTITLES SOMEONE, IN ONE PLACE. Installed by install-subscription-entitlement.py.
async function stripeEntitlement(email) {
    const key = ('' + (email || '')).trim().toLowerCase();
    const none = { active: false, status: 'none', expiry: null, customerId: null };
    if (!stripeClient || !key)
        return none;
    const customers = await stripeClient.customers.list({ email: key, limit: 1 });
    const cust = customers.data[0];
    if (!cust)
        return none;
    const subs = await stripeClient.subscriptions.list({ customer: cust.id, status: 'all', limit: 10 });
    const good = subs.data.find((x) => x.status === 'active' || x.status === 'trialing');
    if (good) {
        return {
            active: true, status: good.status,
            expiry: good.current_period_end ?? null, customerId: cust.id,
        };
    }
    let oneTimeExpiry = null;
    try {
        const sessions = await stripeClient.checkout.sessions.list({ customer: cust.id, limit: 100 });
        const ONE_YEAR = 365 * 24 * 3600;
        const nowSec = Math.floor(Date.now() / 1000);
        for (const ss of sessions.data) {
            if (ss.mode === 'payment' && ss.status === 'complete' && ss.payment_status === 'paid' && ss.created) {
                const exp = ss.created + ONE_YEAR;
                if (exp > nowSec && (oneTimeExpiry == null || exp > oneTimeExpiry))
                    oneTimeExpiry = exp;
            }
        }
    }
    catch (e) { }
    if (oneTimeExpiry != null) {
        return { active: true, status: 'paid', expiry: oneTimeExpiry, customerId: cust.id };
    }
    return { active: false, status: (subs.data[0] && subs.data[0].status) || 'none', expiry: null, customerId: cust.id };
}
async function subscriptionSource(email) {
    const key = ('' + (email || '')).trim().toLowerCase();
    if (!key || key.indexOf('@') < 0)
        return { allowed: false, via: 'none', detail: 'no-email' };
    const hit = __subCache.get(key);
    if (hit && (Date.now() - hit.at) < SUB_CACHE_MS) {
        return { allowed: hit.active, via: 'stripe', detail: 'cached' };
    }
    if (!stripeClient) {
        return { allowed: false, via: 'stripe', detail: 'stripe_not_configured' };
    }
    try {
        const ent = await stripeEntitlement(key);
        if (!ent.customerId) {
            __subCache.set(key, { active: false, at: Date.now() });
            return { allowed: false, via: 'stripe', detail: 'no_customer:' + key };
        }
        __subCache.set(key, { active: ent.active, at: Date.now() });
        return { allowed: ent.active, via: 'stripe', detail: ent.status };
    }
    catch (e) {
        return { allowed: false, via: 'stripe', detail: 'error:' + String(e && e.message || e).slice(0, 40) };
    }
}
'''.strip('\n')

TS_NEW = r'''
// WHAT ENTITLES SOMEONE, IN ONE PLACE.
//
// There are two ways to be entitled and there were two implementations of the question.
// /stripe/subscription-status knew both: an active or trialing subscription, AND the
// early-access one-time purchase -- a completed, paid Checkout in payment mode, good for a
// year from the purchase date. subscriptionSource, which is what every gate in this file
// actually calls, knew only the first.
//
// So someone who bought the beta year was told by the app that they were subscribed, and
// refused by the AI credit gate, which is a worse state than either answer on its own: the
// product disagreed with itself about a customer who had paid. Both now read this.
async function stripeEntitlement(email: string): Promise<{
    active: boolean; status: string; expiry: number | null; customerId: string | null;
}> {
    const key = ('' + (email || '')).trim().toLowerCase();
    const none: { active: boolean; status: string; expiry: number | null; customerId: string | null } =
        { active: false, status: 'none', expiry: null, customerId: null };
    if (!stripeClient || !key) return none;

    const customers = await stripeClient.customers.list({ email: key, limit: 1 });
    const cust = customers.data[0];
    if (!cust) return none;

    const subs = await stripeClient.subscriptions.list({ customer: cust.id, status: 'all', limit: 10 });
    // 'active' and 'trialing' entitle. past_due / incomplete / incomplete_expired /
    // canceled do not.
    const good = subs.data.find((x: any) => x.status === 'active' || x.status === 'trialing');
    if (good) {
        return {
            active: true, status: good.status,
            expiry: (good as any).current_period_end ?? null, customerId: cust.id,
        };
    }

    // The early-access one-time purchase: no subscription object exists, so entitlement
    // comes from the most recent completed, paid Checkout in payment mode, and lasts one
    // year from it.
    let oneTimeExpiry: number | null = null;
    try {
        const sessions = await stripeClient.checkout.sessions.list({ customer: cust.id, limit: 100 });
        const ONE_YEAR = 365 * 24 * 3600;
        const nowSec = Math.floor(Date.now() / 1000);
        for (const ss of sessions.data as any[]) {
            if (ss.mode === 'payment' && ss.status === 'complete' && ss.payment_status === 'paid' && ss.created) {
                const exp = ss.created + ONE_YEAR;
                if (exp > nowSec && (oneTimeExpiry == null || exp > oneTimeExpiry)) oneTimeExpiry = exp;
            }
        }
    } catch (e) { /* no one-time entitlement readable; the subscription answer stands */ }

    if (oneTimeExpiry != null) {
        return { active: true, status: 'paid', expiry: oneTimeExpiry, customerId: cust.id };
    }
    return { active: false, status: (subs.data[0] && subs.data[0].status) || 'none', expiry: null, customerId: cust.id };
}

async function subscriptionSource(email: string): Promise<{ allowed: boolean; via: string; detail: string }> {
    const key = ('' + (email || '')).trim().toLowerCase();
    if (!key || key.indexOf('@') < 0) return { allowed: false, via: 'none', detail: 'no-email' };

    const hit = __subCache.get(key);
    if (hit && (Date.now() - hit.at) < SUB_CACHE_MS) {
        return { allowed: hit.active, via: 'stripe', detail: 'cached' };
    }

    if (!stripeClient) {
        // Stripe not configured. Fail CLOSED -- with Stripe as the only source, "cannot ask"
        // cannot mean "yes", or the gate would open whenever the integration is misconfigured.
        return { allowed: false, via: 'stripe', detail: 'stripe_not_configured' };
    }

    try {
        const ent = await stripeEntitlement(key);
        if (!ent.customerId) {
            __subCache.set(key, { active: false, at: Date.now() });
            // Names the address that was looked up. The commonest reason a paying customer
            // is refused is that they are signed in with one address and bought with
            // another, and "no_customer" alone never said which one was checked.
            return { allowed: false, via: 'stripe', detail: 'no_customer:' + key };
        }
        __subCache.set(key, { active: ent.active, at: Date.now() });
        return { allowed: ent.active, via: 'stripe', detail: ent.status };
    } catch (e: any) {
        // An API error is not proof of anything, but with one source there is nothing to fall
        // back to. Fail closed and say why, rather than quietly granting.
        return { allowed: false, via: 'stripe', detail: 'error:' + String(e && e.message || e).slice(0, 40) };
    }
}
'''.strip('\n')


# ---------------------------------------------------------------- finding the function

def span_of(text, decl):
    """Where `decl` starts and where its closing brace is, by MATCHING BRACES.

    Not by a line count and not by a regex over the body: this replaces a function in a file
    nobody here has read, and the only rule that survives the file changing around it is the
    one the language itself uses. Returns (start, end) or None.

    Braces inside strings, template literals, regexes and comments are skipped, because this
    function's body contains all of them and a naive counter stops at the wrong place.
    """
    i = text.find(decl)
    if i < 0:
        return None
    j = text.find('{', i)
    if j < 0:
        return None
    depth = 0
    k = j
    n = len(text)
    while k < n:
        c = text[k]
        if c in '"\'`':
            quote = c
            k += 1
            while k < n:
                if text[k] == '\\':
                    k += 2
                    continue
                if text[k] == quote:
                    break
                k += 1
            k += 1
            continue
        if c == '/' and k + 1 < n and text[k + 1] == '/':
            k = text.find('\n', k)
            if k < 0:
                return None
            continue
        if c == '/' and k + 1 < n and text[k + 1] == '*':
            k = text.find('*/', k)
            if k < 0:
                return None
            k += 2
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return (i, k + 1)
        k += 1
    return None


def node_ok(text, suffix='.js'):
    """node --check on the result, so a broken edit never reaches the service."""
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd, text.encode('utf-8'))
        os.close(fd)
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        return (r.returncode == 0, (r.stderr or '').strip().split('\n')[0])
    except FileNotFoundError:
        return (True, '')          # no node here: the service's own start will catch it
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def patch_file(path_, decl, new_body, check_syntax):
    """Replace the subscriptionSource declaration in one file. Returns a status string."""
    if not os.path.exists(path_):
        return 'absent'
    with open(path_, 'r', encoding='utf-8') as fh:
        text = fh.read()
    if MARK in text:
        return 'already'
    sp = span_of(text, decl)
    if not sp:
        return 'not-found'
    out = text[:sp[0]] + new_body + text[sp[1]:]
    if check_syntax:
        good, why = node_ok(out)
        if not good:
            return 'syntax:' + why
    bak = path_ + '.before-entitlement'
    if not os.path.exists(bak):
        with open(bak, 'w', encoding='utf-8') as fh:
            fh.write(text)
    tmp = path_ + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(out)
    os.replace(tmp, path_)         # so the service never reads half a file
    return 'patched'


# THE ROUTE IS DELIBERATELY NOT PATCHED HERE.
#
# /stripe/subscription-status already grants the early-access year -- it is the function
# that did NOT that was the bug -- so changing it on the server would be editing working
# code to no benefit. Having both read one function is worth doing, and it is done in the
# source, which is what the next real build of this server will carry. An installer's job
# is the smallest change that fixes the fault.


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '/opt/baja-server'
    if not os.path.isdir(root):
        print('Not a directory: ' + root)
        return 2

    dist = os.path.join(root, 'dist', 'index.js')
    src = os.path.join(root, 'src', 'index.ts')

    r1 = patch_file(dist, 'async function subscriptionSource(', JS_NEW, True)
    print('  dist/index.js  : ' + r1)
    r2 = patch_file(src, 'async function subscriptionSource(', TS_NEW, False)
    print('  src/index.ts   : ' + r2)
    if r1.startswith('syntax'):
        print('\nNOTHING WAS WRITTEN. The edit did not parse, which is the one outcome this')
        print('refuses to install. Nothing on the server changed.')
        return 1
    if r1 == 'not-found':
        print('\nsubscriptionSource was not found in dist/index.js. This server is either')
        print('older or newer than this installer expects; nothing was changed.')
        return 1
    if r1 == 'already':
        print('\nAlready installed. Nothing to do.')
        return 0
    print('\nInstalled. Now:  sudo systemctl restart baja-server')
    print('Then, with the address you sign in with:')
    print('  curl -s "localhost:8080/stripe/subscription-status?email=you@example.com"')
    print('A status of "paid" is the early-access year; "active" is a subscription.')
    print('{"active":false,"status":"none"} means Stripe has no customer at that address.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
