#!/usr/bin/env python
"""Predict, from sequence alone, which RBP knockdowns change a given exon.

The headline metric is mean per-RBP AUC, but on its own that number is easy to
fake: some exons respond to many RBPs, so simply predicting each exon's overall
responsiveness scores well for every individual RBP without the model knowing
anything RBP-specific. The marginal baseline does exactly that, and the claim
worth making is whether the network beats it RBP by RBP.
"""
import argparse, os, json, time, sys
import numpy as np, torch, torch.nn.functional as F
from torch.utils.data import DataLoader
from sklearn.metrics import roc_auc_score
from scipy.stats import wilcoxon
from bajasplice.datasets import build_rbp_matrix, RBPResponseDataset, aligned_binding
from bajasplice.models import PSINet, RBPBindingNet

from bajasplice.config import paths
MIN_POS_EVAL = 10


def per_rbp_auc(score, y, mask):
    """AUC across exons for each RBP separately; RBPs with too few positives skipped."""
    aucs, idx = [], []
    for k in range(y.shape[1]):
        m = mask[:, k]
        if m.sum() < 50:
            continue
        yy = y[m, k]
        if yy.sum() < MIN_POS_EVAL or yy.sum() == m.sum():
            continue
        aucs.append(roc_auc_score(yy, score[m, k])); idx.append(k)
    return np.array(aucs), np.array(idx)


@torch.no_grad()
def predict(model, loader, device):
    model.eval()
    P, Y, M, Mg = [], [], [], []
    for wins, geom, y, mask, bind in loader:
        wins = wins.to(device, non_blocking=True); geom = geom.to(device, non_blocking=True)
        bind = bind.to(device, non_blocking=True)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            lt, lm = (model(wins, geom, bind) if isinstance(model, RBPBindingNet)
                      else model(wins, geom))
        P.append(torch.sigmoid(lt.float()).cpu().numpy())
        Mg.append(torch.sigmoid(lm.float()).cpu().numpy())
        Y.append(y.numpy()); M.append(mask.numpy())
    return (np.concatenate(P), np.concatenate(Y),
            np.concatenate(M), np.concatenate(Mg))


def evaluate(model, loader, device, marginal_truth):
    P, Y, M, Mg = predict(model, loader, device)
    out = {}
    a_model, idx = per_rbp_auc(P, Y, M)
    # control: every RBP gets the same score, the exon's overall responsiveness
    marg = np.repeat(marginal_truth[:, None], Y.shape[1], axis=1)
    a_marg, idx_m = per_rbp_auc(marg, Y, M)
    # control: the model's own predicted marginal, again identical across RBPs
    a_pred_marg, _ = per_rbp_auc(np.repeat(Mg[:, None], Y.shape[1], axis=1), Y, M)

    common = np.intersect1d(idx, idx_m)
    pos_m = {k: v for k, v in zip(idx, a_model)}
    pos_g = {k: v for k, v in zip(idx_m, a_marg)}
    pm = np.array([pos_m[k] for k in common]); pg = np.array([pos_g[k] for k in common])
    out["mean_per_rbp_auc"] = float(pm.mean())
    out["mean_per_rbp_auc_marginal_control"] = float(pg.mean())
    out["mean_per_rbp_auc_predicted_marginal"] = float(np.mean(a_pred_marg))
    out["rbps_scored"] = int(len(common))
    out["rbps_model_beats_marginal"] = int((pm > pg).sum())
    if len(common) > 20:
        out["wilcoxon_p_model_vs_marginal"] = float(
            wilcoxon(pm, pg, alternative="greater").pvalue)
    flat = M.reshape(-1)
    out["overall_auc"] = float(roc_auc_score(Y.reshape(-1)[flat], P.reshape(-1)[flat]))
    out["n_pairs"] = int(flat.sum())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", type=int, default=2000)
    ap.add_argument("--win", type=int, default=400)
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--init-from", type=str, default=None,
                    help="trunk to initialise from; defaults to the PSI model")
    ap.add_argument("--shuffle-labels", action="store_true",
                    help="permute exons within each RBP column; sanity check, expect AUC 0.5")
    ap.add_argument("--use-binding", action="store_true",
                    help="add BajaCLIP per-RBP predicted binding as an input")
    ap.add_argument("--tag", type=str, default="rbp")
    args = ap.parse_args()

    ev, H, M, S, rbps = build_rbp_matrix()
    print(f"events {len(ev):,}  RBPs {len(rbps)}  tested pairs {int(M.sum()):,}  "
          f"positive rate {(H*M).sum()/M.sum():.4f}", flush=True)
    if args.shuffle_labels:
        rng = np.random.default_rng(0)
        for k in range(H.shape[1]):
            p = rng.permutation(len(H))
            H[:, k] = H[p, k]; M[:, k] = M[p, k]
        print("labels shuffled within each RBP column", flush=True)

    B = have = None
    if args.use_binding:
        B, have = aligned_binding(rbps)
        print(f"binding features {B.shape}; {int(have.sum())} of {len(rbps)} RBPs "
              f"have a BajaCLIP model", flush=True)

    loaders, marg = {}, {}
    for sp in ("train", "val", "test"):
        m = (ev.split == sp).to_numpy()
        ds = RBPResponseDataset(ev[m], H[m], M[m], win=args.win, context=args.context,
                                binding=(B[m] if B is not None else None))
        loaders[sp] = DataLoader(ds, batch_size=args.batch_size, shuffle=(sp == "train"),
                                 num_workers=args.workers, pin_memory=True,
                                 persistent_workers=args.workers > 0, drop_last=(sp == "train"))
        marg[sp] = ev[m].marginal_rate.to_numpy()
    print({sp: len(l.dataset) for sp, l in loaders.items()}, flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if args.use_binding:
        model = RBPBindingNet(len(rbps), n_regions=B.shape[1],
                              context=args.context, win=args.win).to(device)
        trunk = model.base.trunk
    else:
        model = PSINet(n_tissues=len(rbps), context=args.context, win=args.win).to(device)
        trunk = model.trunk
    if os.path.exists(args.init_from):
        ck = torch.load(args.init_from, map_location="cpu", weights_only=False)
        sd = {k[len("trunk."):]: v for k, v in ck["model"].items() if k.startswith("trunk.")}
        print("trunk init:", trunk.load_state_dict(sd, strict=False), flush=True)

    pos_rate = (H * M).sum() / M.sum()
    pos_weight = torch.tensor(float((1 - pos_rate) / pos_rate), device=device).clamp(max=50.0)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=args.lr, total_steps=args.epochs * max(1, len(loaders["train"])), pct_start=0.15)

    hist, best = [], -1
    for ep in range(args.epochs):
        model.train(); t0 = time.time(); run = 0.0; n = 0
        for i, (wins, geom, y, mask, bind) in enumerate(loaders["train"]):
            wins = wins.to(device, non_blocking=True); geom = geom.to(device, non_blocking=True)
            y = y.to(device); mask = mask.to(device); bind = bind.to(device, non_blocking=True)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
                lt, lm = (model(wins, geom, bind) if args.use_binding else model(wins, geom))
            per = F.binary_cross_entropy_with_logits(lt.float(), y, reduction="none",
                                                     pos_weight=pos_weight)
            loss_t = (per * mask).sum() / mask.sum().clamp(min=1)
            frac = (y * mask).sum(1) / mask.sum(1).clamp(min=1)
            loss_m = F.binary_cross_entropy_with_logits(lm.float(), frac)
            loss = loss_t + loss_m
            opt.zero_grad(set_to_none=True); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step(); sched.step()
            run += loss.item(); n += 1
            if i % 150 == 0:
                print(f"ep{ep} {i}/{len(loaders['train'])} loss {run/max(n,1):.4f} "
                      f"{(time.time()-t0)/60:.1f} min", flush=True)
        vm = evaluate(model, loaders["val"], device, marg["val"]); vm["epoch"] = ep
        hist.append(vm); print("VAL", json.dumps(vm), flush=True)
        if vm["mean_per_rbp_auc"] > best:
            best = vm["mean_per_rbp_auc"]
            torch.save({"model": model.state_dict(), "args": vars(args), "rbps": rbps},
                       os.path.join(paths().models, f"{args.tag}.pt"))
            print(f"  saved (per-RBP AUC {best:.4f})", flush=True)

    ck = torch.load(os.path.join(paths().models, f"{args.tag}.pt"), weights_only=False)
    model.load_state_dict(ck["model"])
    tm = evaluate(model, loaders["test"], device, marg["test"])
    print("TEST", json.dumps(tm), flush=True)
    with open(os.path.join(paths().results, f"{args.tag}_metrics.json"), "w") as f:
        json.dump({"val_history": hist, "test": tm, "args": vars(args),
                   "n_rbps": len(rbps)}, f, indent=2)


if __name__ == "__main__":
    main()
