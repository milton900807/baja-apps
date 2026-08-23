#!/usr/bin/env python
"""Train the cassette-exon PSI / preferred-exon model on GTEx-derived labels."""
import argparse, os, json, time, sys
import numpy as np, torch, torch.nn.functional as F
from torch.utils.data import DataLoader
from scipy.stats import pearsonr, spearmanr
from sklearn.metrics import roc_auc_score
from bajasplice.datasets import load_events, PSIDataset
from bajasplice.models import PSINet

from bajasplice.config import paths
def metrics(pred_mean, true_mean, pred_tis, true_tis, mask, alt=None):
    """alt: boolean mask of events with real skipping evidence. Because ~88% of
    internal exons are constitutive, the overall correlation mostly measures
    constitutive-vs-not; the *_alt figures say whether PSI is actually
    predicted among exons that are genuinely alternative."""
    out = {}
    ok = np.isfinite(pred_mean) & np.isfinite(true_mean)
    out["mean_psi_pearson"] = float(pearsonr(pred_mean[ok], true_mean[ok])[0])
    out["mean_psi_spearman"] = float(spearmanr(pred_mean[ok], true_mean[ok])[0])
    out["mean_psi_mae"] = float(np.abs(pred_mean[ok] - true_mean[ok]).mean())
    # "preferred" = near-constitutive inclusion; contrast against clearly alternative
    hi = true_mean >= 0.9
    lo = true_mean <= 0.5
    sel = (hi | lo) & ok
    if sel.sum() > 20 and hi[sel].sum() > 0 and lo[sel].sum() > 0:
        out["preferred_auc"] = float(roc_auc_score(hi[sel].astype(int), pred_mean[sel]))
        out["n_preferred"] = int(hi[sel].sum()); out["n_alternative"] = int(lo[sel].sum())
    # per-tissue correlation across events, averaged over tissues
    cors = []
    for t in range(true_tis.shape[1]):
        m = mask[:, t]
        if m.sum() > 50:
            v = true_tis[m, t]
            if v.std() > 1e-6:
                cors.append(pearsonr(pred_tis[m, t], v)[0])
    out["per_tissue_pearson_mean"] = float(np.nanmean(cors)) if cors else float("nan")
    out["n_events"] = int(ok.sum())
    if alt is not None and alt.sum() > 50:
        a = alt & ok
        if a.sum() > 50 and true_mean[a].std() > 1e-6 and pred_mean[a].std() > 1e-6:
            out["alt_pearson"] = float(pearsonr(pred_mean[a], true_mean[a])[0])
            out["alt_spearman"] = float(spearmanr(pred_mean[a], true_mean[a])[0])
            out["alt_mae"] = float(np.abs(pred_mean[a] - true_mean[a]).mean())
        out["n_alt_events"] = int(a.sum())
    return out


@torch.no_grad()
def predict(model, loader, device):
    model.eval()
    PM, TM, PT, TT, MK = [], [], [], [], []
    for wins, geom, y, mask, ymean in loader:
        wins = wins.to(device, non_blocking=True); geom = geom.to(device, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            lt, lm = model(wins, geom)
        PT.append(torch.sigmoid(lt.float()).cpu().numpy())
        PM.append(torch.sigmoid(lm.float()).cpu().numpy())
        TT.append(y.numpy()); MK.append(mask.numpy()); TM.append(ymean.numpy())
    return (np.concatenate(PM), np.concatenate(TM), np.concatenate(PT),
            np.concatenate(TT), np.concatenate(MK))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", type=int, default=2000, choices=[80, 400, 2000, 10000])
    ap.add_argument("--win", type=int, default=400)
    ap.add_argument("--channels", type=int, default=32)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--min-reads", type=int, default=50)
    ap.add_argument("--init-from", type=str, default=None,
                    help="SpliceNet checkpoint to initialise the trunk from")
    ap.add_argument("--tag", type=str, default="psi")
    args = ap.parse_args()

    ev, psi = load_events(min_reads=args.min_reads)
    print(f"events: {len(ev):,}", ev.split.value_counts().to_dict(), flush=True)
    n_tis = psi.shape[1]

    dsets, loaders, evs = {}, {}, {}
    for sp in ("train", "val", "test"):
        m = (ev.split == sp).to_numpy()
        evs[sp] = ev[m].reset_index(drop=True)
        dsets[sp] = PSIDataset(ev[m], psi[m], win=args.win, context=args.context)
        loaders[sp] = DataLoader(dsets[sp], batch_size=args.batch_size,
                                 shuffle=(sp == "train"), num_workers=args.workers,
                                 pin_memory=True, persistent_workers=args.workers > 0,
                                 drop_last=(sp == "train"))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = PSINet(n_tissues=n_tis, context=args.context, ch=args.channels, win=args.win).to(device)
    if args.init_from and os.path.exists(args.init_from):
        ck = torch.load(args.init_from, map_location="cpu", weights_only=False)
        sd = {k: v for k, v in ck["model"].items() if not k.startswith("head.")}
        missing = model.trunk.load_state_dict(sd, strict=False)
        print(f"initialised trunk from {args.init_from}: {missing}", flush=True)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=args.epochs * max(1, len(loaders["train"])), pct_start=0.15)

    hist, best = [], -1e9
    for ep in range(args.epochs):
        model.train(); t0 = time.time(); run = 0.0; n = 0
        for i, (wins, geom, y, mask, ymean) in enumerate(loaders["train"]):
            wins = wins.to(device, non_blocking=True); geom = geom.to(device, non_blocking=True)
            y = y.to(device); mask = mask.to(device); ymean = ymean.to(device)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
                lt, lm = model(wins, geom)
            lt = lt.float(); lm = lm.float()
            per = F.binary_cross_entropy_with_logits(lt, y, reduction="none")
            loss_t = (per * mask).sum() / mask.sum().clamp(min=1)
            loss_m = F.binary_cross_entropy_with_logits(lm, ymean)
            loss = loss_t + loss_m
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step(); sched.step()
            run += loss.item(); n += 1
            if i % 200 == 0:
                print(f"ep{ep} {i}/{len(loaders['train'])} loss {run/max(n,1):.4f} "
                      f"{(time.time()-t0)/60:.1f} min", flush=True)
        alt_val = (evs["val"].skip_total >= 10).to_numpy()
        vm = metrics(*predict(model, loaders["val"], device), alt=alt_val)
        vm.update(epoch=ep, train_loss=run / max(n, 1))
        hist.append(vm); print("VAL", json.dumps(vm), flush=True)
        sel = vm.get("alt_pearson", vm["mean_psi_pearson"])
        if sel > best:
            best = sel
            torch.save({"model": model.state_dict(), "args": vars(args)},
                       os.path.join(paths().models, f"{args.tag}.pt"))
            print(f"  saved (alt r={best:.4f})", flush=True)

    ck = torch.load(os.path.join(paths().models, f"{args.tag}.pt"), weights_only=False)
    model.load_state_dict(ck["model"])
    alt_test = (evs["test"].skip_total >= 10).to_numpy()
    tm = metrics(*predict(model, loaders["test"], device), alt=alt_test)
    print("TEST", json.dumps(tm), flush=True)
    with open(os.path.join(paths().results, f"{args.tag}_metrics.json"), "w") as f:
        json.dump({"val_history": hist, "test": tm, "args": vars(args)}, f, indent=2)


if __name__ == "__main__":
    main()
