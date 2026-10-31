#!/usr/bin/env python3
"""
Send a domain's front door somewhere other than the application.

    sudo python3 set-home-redirect.py                          # gene.clinic/ -> /campaigns
    sudo python3 set-home-redirect.py --show                   # what is set now
    sudo python3 set-home-redirect.py --remove                 # put it back
    sudo python3 set-home-redirect.py --host baja.bio --to /login

WHY NGINX AND NOT THE APPLICATION. https://gene.clinic/ currently loads the whole Angular
bundle, which boots, finds nobody signed in and sends the visitor to /login. For somebody
who has just been given the domain by a family or a clinician, the first thing that
happens is a sign-in wall for an account they have no reason to have. The campaign
directory is public, so the front door goes there instead -- and doing it here means no
download, no boot and no flash of the wrong page, which is not true of a redirect written
inside the app.

ONLY THE BARE PATH MOVES. `location = /` matches the front door exactly, so /login,
/app/..., /f/<code> and everything else are untouched, and anyone who wants the sign-in
page can still go straight to it.

It edits the server block that actually serves the site: the one for that server_name
that has a root, not the little port-80 block that only answers the certbot challenge.
`nginx -t` has to pass before anything is reloaded, and if it does not the original is put
straight back. The backup does NOT go beside the file: sites-enabled is usually included
with a wildcard, so a copy left in there is a second server block for the same name that
nginx loads without complaining. Backups go under /var/backups/baja/nginx/ instead, and
files that look like somebody else's backup are skipped rather than edited.
"""
import os, re, shutil, subprocess, sys

MARK = '# front door (set-home-redirect.py)'

args = sys.argv[1:]
show = '--show' in args
remove = '--remove' in args
host = 'gene.clinic'
to = '/campaigns'
conf_dirs = ['/etc/nginx']
for flag in ('--host', '--to', '--nginx-dir'):
    if flag in args:
        i = args.index(flag)
        if i + 1 >= len(args):
            sys.exit(flag + ' needs a value.')
        v = args[i + 1]
        if flag == '--host': host = v
        elif flag == '--to': to = v
        else: conf_dirs = [v]
        del args[i:i + 2]

if not to.startswith('/'):
    sys.exit('--to has to be a path on this site, starting with /.')


def files():
    out = []
    for d in conf_dirs:
        for root, _dirs, names in os.walk(d):
            for n in names:
                p = os.path.join(root, n)
                if os.path.islink(p) or not os.path.isfile(p):
                    continue
                # A backup, someone's editor leftover, a disabled site: not the live
                # configuration, and editing one would be editing nothing.
                if re.search(r'\.(bak|orig|save|swp|disabled|before-[a-z0-9]+)$|~$|\.dpkg-|\.ucf-', n):
                    continue
                try:
                    if os.path.getsize(p) > 2 * 1024 * 1024:
                        continue
                    t = open(p, encoding='utf-8', errors='replace').read()
                except OSError:
                    continue
                if re.search(r'^\s*server_name\s[^;]*\b' + re.escape(host) + r'\b', t, flags=re.M):
                    out.append((p, t))
    return out


def blocks(text):
    """Every server { ... } in the file, as (start, end) over the braces."""
    out = []
    for m in re.finditer(r'^\s*server\s*\{', text, flags=re.M):
        i = text.index('{', m.start())
        depth, j = 0, i
        while j < len(text):
            if text[j] == '{': depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0:
                    out.append((m.start(), j + 1))
                    break
            j += 1
    return out


def serving_block(text):
    """The block for this host that actually serves the site, not the challenge stub."""
    best = None
    for a, b in blocks(text):
        body = text[a:b]
        if not re.search(r'^\s*server_name\s[^;]*\b' + re.escape(host) + r'\b', body, flags=re.M):
            continue
        if not re.search(r'^\s*root\s+\S+;', body, flags=re.M):
            continue        # the port-80 certbot block has no root of its own
        if best is None or len(body) > len(text[best[0]:best[1]]):
            best = (a, b)
    return best


found = files()
if not found:
    sys.exit('No nginx file mentions server_name ' + host + '. Nothing was changed.')

if show:
    for p, t in found:
        for a, b in blocks(t):
            body = t[a:b]
            if host not in body:
                continue
            m = re.search(r'location\s*=\s*/\s*\{([^}]*)\}', body)
            has_root = re.search(r'^\s*root\s+(\S+);', body, flags=re.M)
            print('%s  %s' % (p, 'serves the site from ' + has_root.group(1) if has_root else '(no root: a redirect or challenge block)'))
            if m:
                print('    location = /  ->' + m.group(1).strip().replace('\n', ' '))
            elif has_root:
                print('    location = /  not set: the front door loads the application')
    sys.exit(0)

changed = []
for p, t in found:
    orig = t
    if remove:
        t2 = re.sub(r'\n[^\n]*' + re.escape(MARK) + r'[^\n]*\n\s*location\s*=\s*/\s*\{[^}]*\}\n', '\n', t)
        if t2 == t:
            continue
        t = t2
    else:
        blk = serving_block(t)
        if not blk:
            continue
        a, b = blk
        body = t[a:b]
        line = '\n    ' + MARK + '\n    location = / { return 302 ' + to + '; }\n'
        # Replace a redirect this script wrote before; refuse to touch a hand-written one.
        got = re.search(r'\n[^\n]*' + re.escape(MARK) + r'[^\n]*\n\s*location\s*=\s*/\s*\{[^}]*\}\n', body)
        if got:
            new_body = body[:got.start()] + line + body[got.end():]
        else:
            if re.search(r'location\s*=\s*/\s*\{', body):
                sys.exit('That server block already has its own "location = /" and this did not write it.'
                         ' Nothing was changed; edit it by hand or remove it first.')
            at = re.search(r'^\s*server_name\s[^;]*;\s*$', body, flags=re.M)
            ins = at.end() if at else body.index('{') + 1
            new_body = body[:ins] + line.rstrip('\n') + body[ins:]
        t = t[:a] + new_body + t[b:]
    if t != orig:
        changed.append((p, orig, t))

if not changed:
    sys.exit('Nothing to change: ' + ('no redirect from this script was there' if remove
             else 'the front door is already set, or no block for ' + host + ' serves the site') + '.')

BACKUPS = '/var/backups/baja/nginx'
for p, orig, new in changed:
    try:
        os.makedirs(BACKUPS, exist_ok=True)
        keep = os.path.join(BACKUPS, os.path.basename(p) + '.before-frontdoor')
        if not os.path.exists(keep):
            shutil.copyfile(p, keep)
            print('Kept the original at ' + keep)
    except OSError as e:
        sys.exit('Could not write a backup (' + str(e) + '). Nothing was changed.')
    open(p, 'w', encoding='utf-8').write(new)
    print(('Updated ' if not remove else 'Cleared ') + p)

r = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
if r.returncode != 0:
    for p, orig, _new in changed:
        open(p, 'w', encoding='utf-8').write(orig)
    print((r.stderr or r.stdout or '').strip())
    sys.exit('nginx refused the result, so every file was put back exactly as it was.')
print((r.stderr or r.stdout or '').strip().split('\n')[-1])
rl = subprocess.run(['nginx', '-s', 'reload'], capture_output=True, text=True)
if rl.returncode != 0:
    rl = subprocess.run(['systemctl', 'reload', 'nginx'], capture_output=True, text=True)
print('Reloaded.' if rl.returncode == 0 else 'Written, but the reload did not run: reload nginx yourself.')
print('https://' + host + '/  ' + ('loads the application again.' if remove else 'now goes to ' + to + '.'))
