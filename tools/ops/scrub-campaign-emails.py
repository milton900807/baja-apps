#!/usr/bin/env python3
"""
Take the organiser's email address out of campaigns that are already published.

    sudo python3 scrub-campaign-emails.py --show         # what it would change
    sudo python3 scrub-campaign-emails.py                # change it
    sudo python3 scrub-campaign-emails.py /home/ubuntu/baja-users

Until now the console wrote the publisher's sign-in address into the campaign document as
`by`, and the public display printed it under the total: "Updated Oct 31, 8:50 AM .
somebody@gmail.com". The display no longer shows it and the console no longer writes it,
but neither of those reaches a campaign that was published before the change. The document
is fetched by anyone who opens the share link, so the address is still out there in the
bytes until it is taken out of the file.

This walks every account's public folder, drops the `by` key from each .fund document, and
leaves everything else exactly as it was, including the file's formatting where it can.
Each file it touches is copied to <name>.before-scrub first, once; a second run over an
already-clean tree says there is nothing to do.

It does not touch .fundimg or .fundteam (no addresses in those), and it does not look
outside the user-data directory.
"""
import json, os, shutil, sys

def main(argv):
    show = '--show' in argv
    args = [a for a in argv[1:] if not a.startswith('--')]
    root = args[0] if args else os.path.expanduser('~/baja-users')
    if not os.path.isdir(root):
        print('Not a directory: ' + root)
        print('Pass the user-data directory, e.g. /home/ubuntu/baja-users')
        return 2

    looked = hits = done = 0
    for account in sorted(os.listdir(root)):
        pub = os.path.join(root, account, 'public')
        if not os.path.isdir(pub):
            continue
        for name in sorted(os.listdir(pub)):
            if not name.endswith('.fund'):
                continue
            full = os.path.join(pub, name)
            looked += 1
            try:
                with open(full, encoding='utf-8') as fh:
                    doc = json.load(fh)
            except Exception as e:
                print('  skipped (unreadable): ' + full + ': ' + str(e))
                continue
            if not isinstance(doc, dict) or 'by' not in doc:
                continue
            hits += 1
            who = str(doc.get('by') or '')
            print(('  would clear ' if show else '  cleared    ')
                  + account[:12] + '…/public/' + name + '   (' + (who or 'empty') + ')')
            if show:
                continue
            del doc['by']
            # A temp file in the same directory, then a rename: a half-written campaign is
            # a campaign whose display goes blank for everyone watching it.
            keep = full + '.before-scrub'
            if not os.path.exists(keep):
                shutil.copy2(full, keep)
            tmp = full + '.scrub-tmp'
            with open(tmp, 'w', encoding='utf-8') as fh:
                json.dump(doc, fh)
            shutil.copystat(full, tmp)
            os.replace(tmp, full)
            done += 1

    print('')
    print('Looked at %d campaign%s.' % (looked, '' if looked == 1 else 's'))
    if not hits:
        print('None of them had an address in it. Nothing to do.')
    elif show:
        print('%d would be changed. Run it again without --show.' % hits)
    else:
        print('%d changed. The originals are beside them as .before-scrub.' % done)
        print('The display caches a campaign for a few seconds, so an open page catches up on its own.')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
