#!/usr/bin/env python3
"""
The name a shared link shows, without rebuilding the front end.

    sudo python3 set-site-title.py /eln/index.html           # write it
    python3 set-site-title.py /eln/index.html --show         # what it would write
    sudo python3 set-site-title.py /eln/index.html --title "Something else"

WHY THIS EXISTS. Facebook, Slack, iMessage, WhatsApp and the rest fetch index.html and do
not run the application, so the <title> in that file is the name on the card for every link
into this origin. It said "BajaBio GeneTx Designer", which turned a link to a fundraising
page into an advert for design software. The og: and twitter: tags say the same thing in the
form those readers prefer, and this writes both.

A CAMPAIGN'S OWN LINK IS NOT AFFECTED. /f/<code> is answered by baja-server with that
campaign's own title and picture, and never reaches this file.

RUN IT AGAIN AFTER A FRONT-END DEPLOY. index.html comes out of the build, so a deploy
replaces it and takes this with it. Once the front end is built from baja main the file
already says this and running it changes nothing.

Safe to run twice. The file is backed up beside itself the first time.
"""
import os, re, shutil, sys

TITLE = 'Gene.Clinic fundraising'
DESC = ('Raise money for rare disease research. No charge to run a campaign, '
        'and we do not take a share of what you raise.')
MARK_OPEN = '  <!-- ---- link preview (set-site-title.py) ---- -->'
MARK_CLOSE = '  <!-- ---- end link preview ---- -->'

args = [a for a in sys.argv[1:]]
show = '--show' in args
if '--title' in args:
    i = args.index('--title')
    if i + 1 >= len(args):
        sys.exit('--title needs the text to use.')
    TITLE = args[i + 1]
    del args[i:i + 2]
rest = [a for a in args if not a.startswith('--')]
path = os.path.expanduser(rest[0] if rest else '/eln/index.html')


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def block():
    return '\n'.join([
        MARK_OPEN,
        '  <meta name="description" content="%s">' % esc(DESC),
        '  <meta property="og:title" content="%s">' % esc(TITLE),
        '  <meta property="og:description" content="%s">' % esc(DESC),
        '  <meta property="og:site_name" content="gene.clinic">',
        '  <meta property="og:type" content="website">',
        '  <meta name="twitter:card" content="summary">',
        '  <meta name="twitter:title" content="%s">' % esc(TITLE),
        '  <meta name="twitter:description" content="%s">' % esc(DESC),
        MARK_CLOSE,
    ]) + '\n'


if show:
    print('  <title>%s</title>' % esc(TITLE))
    print(block(), end='')
    sys.exit(0)

if not os.path.isfile(path):
    sys.exit('Not found: ' + path + '  (pass the path to the deployed index.html)')

raw = open(path, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
s = raw.replace('\r\n', '\n')
if '<title' not in s:
    sys.exit(path + ' has no <title>, so it is not the page this expects. Nothing was changed.')

before = re.search(r'<title[^>]*>(.*?)</title>', s, flags=re.S)
s = re.sub(r'<title[^>]*>.*?</title>', lambda m: '<title>' + esc(TITLE) + '</title>', s, count=1, flags=re.S)

# The tags this script wrote before are replaced; tags the BUILD wrote are left where they
# are and the new ones go after them, which is what a reader uses -- the last one wins in
# every crawler that accepts more than one.
pat = re.escape(MARK_OPEN) + r'.*?' + re.escape(MARK_CLOSE) + r'\n?'
if re.search(pat, s, flags=re.S):
    s = re.sub(pat, lambda m: block(), s, count=1, flags=re.S)
    what = 'Updated'
else:
    at = s.lower().index('</head>')
    s = s[:at] + block() + s[at:]
    what = 'Added to'

if not os.path.exists(path + '.before-title'):
    shutil.copyfile(path, path + '.before-title')
open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)
print(what, path)
print('  was:  ' + ((before.group(1).strip() if before else '?') or '(empty)'))
print('  now:  ' + TITLE)
print('A shared link shows the new name once the reader re-reads the page. Facebook caches')
print('hard: https://developers.facebook.com/tools/debug/ forces it.')
print('Run this again after a front-end deploy, which replaces index.html.')
