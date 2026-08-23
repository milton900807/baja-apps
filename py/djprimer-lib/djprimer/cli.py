"""Command line interface.

    djprimer score GAPDH CAACAGTGGCAACACCTTGTG TGGGTTGGTCATGCTCACTAG
    djprimer serve --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import argparse
import json
import sys


def _score(args):
    from djprimer import load_model
    m = load_model()
    res = m.score(args.gene, args.forward, args.reverse)
    if args.json:
        print(json.dumps(res))
    else:
        note = "" if res["expression_known"] else "  (design-only: gene not in expression references)"
        print(f"{res['gene']}: success probability {res['probability']:.2f}{note}")


def _serve(args):
    try:
        import uvicorn
    except ImportError:
        sys.exit("serving needs uvicorn: pip install 'djprimer[service]'")
    uvicorn.run("djprimer.service:app", host=args.host, port=args.port, reload=args.reload)


def main(argv=None):
    p = argparse.ArgumentParser(prog="djprimer",
                                description="qPCR assay-success prediction (djPrimer).")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("score", help="score one assay")
    s.add_argument("gene")
    s.add_argument("forward")
    s.add_argument("reverse")
    s.add_argument("--json", action="store_true", help="emit JSON")
    s.set_defaults(func=_score)

    v = sub.add_parser("serve", help="run the HTTP service")
    v.add_argument("--host", default="127.0.0.1")
    v.add_argument("--port", type=int, default=8000)
    v.add_argument("--reload", action="store_true")
    v.set_defaults(func=_serve)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
