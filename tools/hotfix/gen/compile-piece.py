#!/usr/bin/env python3
"""Compile one TypeScript slice of src/index.ts to the JS the installer inserts.

The slice is prepended with declarations for everything it borrows from the rest of the
file, compiled with the project's own target, and the declarations are then dropped: they
emit nothing, so what is left is exactly the slice.
"""
import os, re, subprocess, sys, tempfile, shutil

SRV = os.environ.get('BAJA_SERVER', '/home/claude/milton900807/baja-server')
D = os.environ.get('PIECES', '/tmp/claude-0/donsrv')
PRE = """declare const app: any;
declare const fs: any;
declare const path: any;
declare const userData: string;
declare const express: any;
declare function encodeEmail(e: string): string;
declare function decodeEmail(e: string): string;
declare const FUNDRAISE_ADMINS: string[];
declare const CAMPAIGNS_TTL: number;
declare let __campaignsCache: { at: number; list: any[] };
declare function loadShareAliases(): any;
declare function normEmail(e: string): string;
declare const crypto: any;
//<<<SLICE>>>
"""

def main(names):
    tmp = tempfile.mkdtemp(prefix='piece-')
    try:
        for name in names:
            src = open(os.path.join(D, name + '.ts'), encoding='utf-8').read()
            f = os.path.join(tmp, name + '.ts')
            open(f, 'w', encoding='utf-8').write(PRE + src)
            r = subprocess.run(['npx', 'tsc', '--target', 'ES2020', '--module', 'commonjs',
                                '--esModuleInterop', '--skipLibCheck', '--removeComments', 'false',
                                '--outDir', tmp, f], cwd=SRV, capture_output=True, text=True)
            out = os.path.join(tmp, name + '.js')
            if not os.path.exists(out):
                print(r.stdout or r.stderr); sys.exit(name + ': tsc produced nothing')
            js = open(out, encoding='utf-8').read()
            i = js.index('//<<<SLICE>>>')
            js = js[i + len('//<<<SLICE>>>'):].lstrip('\n').rstrip('\n') + '\n'
            dest = os.path.join(D, 'js7', name + '-tmp.js')
            open(dest, 'w', encoding='utf-8').write(js)
            print('%-5s %6d bytes -> %s' % (name, len(js), dest))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

main(sys.argv[1:])
