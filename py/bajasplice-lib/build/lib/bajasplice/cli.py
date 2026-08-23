"""Command line interface.

    bajasplice config --root ~/ml/splicing --genome-fasta GRCh38.fa --gencode-gtf v50.gtf --save
    bajasplice prepare gencode
    bajasplice train splicesite --context 2000 --epochs 8
    bajasplice evaluate report
    bajasplice scan --gene TARDBP --top 10
    bajasplice plot --gene TARDBP --top-sites 2 --out tardbp.json --png tardbp.png
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys

from bajasplice.config import configure, paths

# subcommand -> module providing main()
PREPARE = {
    "gencode": "bajasplice.prepare.gencode",
    "geneindex": "bajasplice.index",
    "gtex": "bajasplice.prepare.gtex",
    "events": "bajasplice.prepare.events",
    "encode-download": "bajasplice.prepare.encode_download",
    "encode-psi": "bajasplice.prepare.encode_psi",
    "encode-dpsi": "bajasplice.prepare.encode_dpsi",
    "binding": "bajasplice.prepare.binding",
    "cryptic": "bajasplice.prepare.cryptic",
}
TRAIN = {
    "splicesite": "bajasplice.train.splicesite",
    "psi": "bajasplice.train.psi",
    "altss": "bajasplice.train.altss",
    "rbp": "bajasplice.train.rbp",
}
EVALUATE = {
    "baseline-splicesite": "bajasplice.evaluate.baselines_splicesite",
    "baseline-psi": "bajasplice.evaluate.baselines_psi",
    "baseline-altss": "bajasplice.evaluate.baselines_altss",
    "vastdb": "bajasplice.evaluate.vastdb",
    "eclip": "bajasplice.evaluate.eclip",
    "binding-vs-response": "bajasplice.evaluate.binding_vs_response",
    "rbp": "bajasplice.evaluate.rbp",
    "cryptic-known": "bajasplice.evaluate.cryptic_known",
    "cryptic-benchmark": "bajasplice.evaluate.cryptic_benchmark",
    "gene-rank": "bajasplice.evaluate.gene_rank",
    "report": "bajasplice.evaluate.report",
}


def _dispatch(table, name, rest):
    if name not in table:
        raise SystemExit(f"unknown step '{name}'. choose from: {', '.join(sorted(table))}")
    mod = importlib.import_module(table[name])
    if not hasattr(mod, "main"):
        raise SystemExit(f"{table[name]} has no main()")
    sys.argv = [f"bajasplice {name}"] + rest
    return mod.main()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    p = argparse.ArgumentParser(prog="bajasplice", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("config", help="show or set data paths")
    for f in ("root", "genome-fasta", "gencode-gtf", "gencode-v29-gtf",
              "bajaclip-bundle", "eclip-dataset"):
        c.add_argument(f"--{f}")
    c.add_argument("--save", action="store_true", help="persist to ~/.config/bajasplice/config.json")

    for name, table, helptext in (("prepare", PREPARE, "build datasets"),
                                  ("train", TRAIN, "train a model"),
                                  ("evaluate", EVALUATE, "evaluate / run controls")):
        s = sub.add_parser(name, help=helptext, add_help=False)
        s.add_argument("step", choices=sorted(table))

    sub.add_parser("scan", help="score a gene or interval for splice sites",
                   add_help=False)
    sub.add_parser("plot", help="build a gene track payload (JSON) or a PNG",
                   add_help=False)

    # options after the step belong to the step's own parser, so collect them
    # here rather than letting the top-level parser reject them
    args, extra = p.parse_known_args(argv)

    if args.cmd == "config":
        pp = configure(root=args.root, genome_fasta=args.genome_fasta,
                       gencode_gtf=args.gencode_gtf, gencode_v29_gtf=args.gencode_v29_gtf,
                       bajaclip_bundle=args.bajaclip_bundle, eclip_dataset=args.eclip_dataset,
                       save=args.save)
        pp.ensure()
        print(json.dumps(pp.to_dict(), indent=2))
        return 0

    paths().ensure()
    if args.cmd == "prepare":
        return _dispatch(PREPARE, args.step, extra)
    if args.cmd == "train":
        return _dispatch(TRAIN, args.step, extra)
    if args.cmd == "evaluate":
        return _dispatch(EVALUATE, args.step, extra)
    if args.cmd == "scan":
        from bajasplice import scan
        sys.argv = ["bajasplice scan"] + extra
        return scan.main()
    if args.cmd == "plot":
        from bajasplice import tracks
        sys.argv = ["bajasplice plot"] + extra
        return tracks.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
