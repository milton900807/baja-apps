#!/usr/bin/env python
"""Train the SpliceAI-style per-nucleotide splice-site model.

Evaluation uses the SpliceAI convention: top-k accuracy (k = number of true
sites in the evaluated set) and PR-AUC, computed separately for acceptors and
donors over held-out chromosomes.
"""
import argparse, os, pickle, time, json
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from torch.utils.data import DataLoader
import sys
from bajasplice.datasets import SpliceSiteDataset
from bajasplice.models import SpliceNet

from bajasplice.config import paths
def topk_accuracy(y_true_bin, y_score):
    """Fraction of true sites recovered in the top-k scoring positions, k = #true."""
    k = int(y_true_bin.sum())
    if k == 0:
        return float("nan")
    idx = np.argpartition(-y_score, k - 1)[:k]
    return float(y_true_bin[idx].sum() / k)


def pr_auc(y_true_bin, y_score):
    from sklearn.metrics import average_precision_score
    if y_true_bin.sum() == 0:
        return float("nan")
    return float(average_precision_score(y_true_bin, y_score))


@torch.no_grad()
def evaluate(model, loader, device, max_batches=None):
    model.eval()
    probs, labels = [], []
    for bi, (x, y) in enumerate(loader):
        if max_batches and bi >= max_batches:
            break
        x = x.to(device, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            logit = model(x)
        p = torch.softmax(logit.float(), dim=1)          # (B,3,L)
        # float16/int8 keeps the full test set (~4e8 positions) in a few GB
        probs.append(p[:, 1:, :].permute(0, 2, 1).reshape(-1, 2).half().cpu().numpy())
        labels.append(y.reshape(-1).to(torch.int8).numpy())
    P = np.concatenate(probs); Y = np.concatenate(labels)
    out = {}
    for cls, name in ((1, "acceptor"), (2, "donor")):
        yb = (Y == cls).astype(np.int8)
        sc = P[:, cls - 1].astype(np.float32)
        out[f"{name}_topk"] = topk_accuracy(yb, sc)
        out[f"{name}_prauc"] = pr_auc(yb, sc)
        out[f"{name}_n_true"] = int(yb.sum())
    out["n_positions"] = int(len(Y))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", type=int, default=2000, choices=[80, 400, 2000, 10000])
    ap.add_argument("--target-len", type=int, default=5000)
    ap.add_argument("--channels", type=int, default=32)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--eval-batches", type=int, default=400)
    ap.add_argument("--tag", type=str, default=None)
    args = ap.parse_args()
    tag = args.tag or f"ss_ctx{args.context}"

    with open(os.path.join(paths().processed, "splicesite_index.pkl"), "rb") as f:
        idx = pickle.load(f)
    W, S = idx["windows"], idx["sites"]

    dsets = {sp: SpliceSiteDataset(W[W.split == sp], S, context=args.context,
                                   target_len=args.target_len)
             for sp in ("train", "val", "test")}
    loaders = {sp: DataLoader(d, batch_size=args.batch_size, shuffle=(sp == "train"),
                              num_workers=args.workers, pin_memory=True,
                              persistent_workers=args.workers > 0, drop_last=(sp == "train"))
               for sp, d in dsets.items()}
    print({sp: len(d) for sp, d in dsets.items()}, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = SpliceNet(context=args.context, ch=args.channels).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-6)
    steps = args.epochs * max(1, len(loaders["train"]))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps,
                                                pct_start=0.1)
    # splice sites are ~1/5000 of positions; upweight them
    w = torch.tensor([1.0, 100.0, 100.0], device=device)

    hist, best = [], -1
    for ep in range(args.epochs):
        model.train(); t0 = time.time(); run = 0.0; n = 0
        for i, (x, y) in enumerate(loaders["train"]):
            x = x.to(device, non_blocking=True); y = y.to(device, non_blocking=True)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
                logit = model(x)
                loss = F.cross_entropy(logit.float(), y, weight=w)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step(); sched.step()
            run += loss.item(); n += 1
            if i % 500 == 0:
                print(f"ep{ep} step {i}/{len(loaders['train'])} loss {run/max(n,1):.4f} "
                      f"{(time.time()-t0)/60:.1f} min", flush=True)
        vm = evaluate(model, loaders["val"], device, args.eval_batches)
        vm.update(epoch=ep, train_loss=run / max(n, 1), minutes=(time.time() - t0) / 60)
        hist.append(vm)
        print("VAL", json.dumps(vm), flush=True)
        score = np.nanmean([vm["acceptor_topk"], vm["donor_topk"]])
        if score > best:
            best = score
            torch.save({"model": model.state_dict(), "args": vars(args)},
                       os.path.join(paths().models, f"{tag}.pt"))
            print(f"  saved (top-k {score:.4f})", flush=True)

    ck = torch.load(os.path.join(paths().models, f"{tag}.pt"), weights_only=False)
    model.load_state_dict(ck["model"])
    tm = evaluate(model, loaders["test"], device, max_batches=None)
    print("TEST", json.dumps(tm), flush=True)
    os.makedirs(paths().results, exist_ok=True)
    with open(os.path.join(paths().results, f"{tag}_metrics.json"), "w") as f:
        json.dump({"val_history": hist, "test": tm, "args": vars(args)}, f, indent=2)


if __name__ == "__main__":
    main()
