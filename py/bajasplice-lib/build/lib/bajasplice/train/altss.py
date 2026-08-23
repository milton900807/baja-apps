#!/usr/bin/env python
"""Train the competing-splice-site model: which site is preferred, and by how much."""
import argparse, os, json, time, sys
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from torch.utils.data import DataLoader
from scipy.stats import pearsonr
from bajasplice.datasets import load_groups, AltSSDataset, MAX_GROUP
from bajasplice.models import SpliceNet

from bajasplice.config import paths
class AltSSNet(nn.Module):
    def __init__(self, context=2000, ch=32):
        super().__init__()
        self.trunk = SpliceNet(context=context, ch=ch)
        self.pool = nn.AdaptiveAvgPool1d(8)
        self.score = nn.Sequential(nn.Linear(ch * 8 + 2, 128), nn.ReLU(),
                                   nn.Dropout(0.1), nn.Linear(128, 1))

    def forward(self, x, feat, mask):
        B, G = x.shape[0], x.shape[1]
        h = self.trunk.trunk(x.reshape(B * G, x.shape[2], x.shape[3]))
        h = self.pool(h).reshape(B * G, -1)
        s = self.score(torch.cat([h, feat.reshape(B * G, -1)], 1)).reshape(B, G)
        return s.masked_fill(~mask, -1e4)


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    top1, n, pu, tu = 0, 0, [], []
    for x, feat, y, mask in loader:
        x = x.to(device); feat = feat.to(device); mask = mask.to(device)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            s = model(x, feat, mask)
        p = torch.softmax(s.float(), 1).cpu().numpy()
        y = y.numpy(); mk = mask.cpu().numpy()
        top1 += (p.argmax(1) == y.argmax(1)).sum(); n += len(y)
        pu.append(p[mk]); tu.append(y[mk])
    pu = np.concatenate(pu); tu = np.concatenate(tu)
    return {"preferred_top1_acc": float(top1 / max(n, 1)),
            "usage_pearson": float(pearsonr(pu, tu)[0]),
            "usage_mae": float(np.abs(pu - tu).mean()),
            "n_groups": int(n)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", type=int, default=2000)
    ap.add_argument("--win", type=int, default=200)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--init-from", type=str, default=None)
    ap.add_argument("--tag", type=str, default="altss")
    args = ap.parse_args()

    a = load_groups()
    print(f"rows {len(a):,}  groups {a.group_id.nunique():,}",
          a.groupby('split').group_id.nunique().to_dict(), flush=True)
    loaders = {}
    for sp in ("train", "val", "test"):
        d = AltSSDataset(a[a.split == sp], win=args.win, context=args.context)
        loaders[sp] = DataLoader(d, batch_size=args.batch_size, shuffle=(sp == "train"),
                                 num_workers=args.workers, pin_memory=True,
                                 persistent_workers=args.workers > 0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = AltSSNet(context=args.context).to(device)
    if args.init_from and os.path.exists(args.init_from):
        ck = torch.load(args.init_from, map_location="cpu", weights_only=False)
        sd = {k: v for k, v in ck["model"].items() if not k.startswith("head.")}
        print("trunk init:", model.trunk.load_state_dict(sd, strict=False), flush=True)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=args.epochs * max(1, len(loaders["train"])), pct_start=0.15)

    hist, best = [], -1
    for ep in range(args.epochs):
        model.train(); t0 = time.time(); run = 0.0; n = 0
        for i, (x, feat, y, mask) in enumerate(loaders["train"]):
            x = x.to(device, non_blocking=True); feat = feat.to(device)
            y = y.to(device); mask = mask.to(device)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
                s = model(x, feat, mask)
            logp = F.log_softmax(s.float(), 1)
            loss = -(y * logp).sum(1).mean()          # cross-entropy against soft usage
            opt.zero_grad(set_to_none=True); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step(); sched.step()
            run += loss.item(); n += 1
            if i % 300 == 0:
                print(f"ep{ep} {i}/{len(loaders['train'])} loss {run/max(n,1):.4f} "
                      f"{(time.time()-t0)/60:.1f} min", flush=True)
        vm = evaluate(model, loaders["val"], device); vm["epoch"] = ep
        hist.append(vm); print("VAL", json.dumps(vm), flush=True)
        if vm["preferred_top1_acc"] > best:
            best = vm["preferred_top1_acc"]
            torch.save({"model": model.state_dict(), "args": vars(args)},
                       os.path.join(paths().models, f"{args.tag}.pt"))
            print(f"  saved (top1 {best:.4f})", flush=True)

    ck = torch.load(os.path.join(paths().models, f"{args.tag}.pt"), weights_only=False)
    model.load_state_dict(ck["model"])
    tm = evaluate(model, loaders["test"], device)
    print("TEST", json.dumps(tm), flush=True)
    with open(os.path.join(paths().results, f"{args.tag}_metrics.json"), "w") as f:
        json.dump({"val_history": hist, "test": tm, "args": vars(args)}, f, indent=2)


if __name__ == "__main__":
    main()
