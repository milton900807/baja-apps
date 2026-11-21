"""Score this species' held-out windows with a model trained on another one.

This is the control a species-specific model has to beat. Splice-site grammar
is deeply conserved, so a human-trained SpliceNet already does well on mouse
without seeing a single mouse base. Until the mouse model clears this number
there is no evidence that training on mouse bought anything.

THIS CONTROL IS GENEROUS TO THE OTHER SPECIES' MODEL, AND THAT IS THE RIGHT WAY
ROUND. The human model trained on human chr6, chr8, chr10 and the rest, which
carry the orthologs of genes on the mouse test chromosomes; mouse chr1 alone is
syntenic to parts of human chr1, 2, 6 and 8. So the held-out mouse windows are
not held out from it in the sense they are from a mouse model trained on mouse
train chromosomes. A mouse model that beats it has beaten an opponent with an
advantage; one that only ties it has not shown much.

Same windows, same metrics, same code path as `train splicesite`, so the rows
are directly comparable.
"""
from __future__ import annotations

import argparse
import json
import os
import pickle

import torch
from torch.utils.data import DataLoader

from bajasplice.config import paths, species, SPECIES
from bajasplice.datasets import SpliceSiteDataset
from bajasplice.models import SpliceNet


def main():
    sp = species()
    others = [k for k in SPECIES if k != sp.key]
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", choices=sorted(SPECIES), default=others[0],
                    help="species whose bundled model to use (default: %(default)s)")
    ap.add_argument("--ckpt", help="an explicit checkpoint instead of the bundled one")
    ap.add_argument("--name", default="ss_ctx2000")
    ap.add_argument("--split", default="test", choices=["val", "test"])
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--max-batches", type=int, default=None)
    a = ap.parse_args()

    ckpt = a.ckpt
    if not ckpt:
        from bajasplice.weights import bundled
        ckpt = bundled(a.name, species=a.source)
        if ckpt is None:
            raise SystemExit(
                f"no bundled {a.source} checkpoint '{a.name}' in this install. Pass --ckpt "
                f"with the path to one (for human: <human root>/models/{a.name}.pt).")
    ck = torch.load(str(ckpt), map_location="cpu", weights_only=False)
    trained_on = ck.get("species", "human")
    if trained_on == sp.key:
        raise SystemExit(f"{ckpt} was trained on {sp.key}; that is not a zero-shot control.")

    with open(os.path.join(paths().processed, "splicesite_index.pkl"), "rb") as f:
        idx = pickle.load(f)
    W, S = idx["windows"], idx["sites"]
    target_len = int(W.win_end.iloc[0] - W.win_start.iloc[0] + 1)
    context = ck["args"]["context"]
    ds = SpliceSiteDataset(W[W.split == a.split], S, context=context, target_len=target_len)
    dl = DataLoader(ds, batch_size=a.batch_size, shuffle=False, num_workers=a.workers,
                    pin_memory=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = SpliceNet(context=context, ch=ck["args"]["channels"]).to(device)
    model.load_state_dict(ck["model"])

    from bajasplice.train.splicesite import evaluate
    print(f"{trained_on} model {ckpt} on {len(ds):,} {sp.label} {a.split} windows", flush=True)
    m = evaluate(model, dl, device, max_batches=a.max_batches)
    print("ZERO-SHOT", a.split.upper(), json.dumps(m), flush=True)

    os.makedirs(paths().results, exist_ok=True)
    out = os.path.join(paths().results, f"zero_shot_{trained_on}_metrics.json")
    with open(out, "w") as f:
        json.dump({a.split: m, "checkpoint": str(ckpt), "trained_on": trained_on,
                   "species": sp.key, "assembly": sp.assembly,
                   "note": "orthologs of these windows were in the source model's "
                           "training set; treat as an upper-biased control. The bias "
                           "shrinks with distance: large between mammals, small "
                           "between a mammal and an insect"}, f, indent=2)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
