#!/usr/bin/env python
"""Model architectures.

SpliceNet   - SpliceAI-style residual dilated CNN, per-nucleotide 3-way output
              (not-a-site / acceptor / donor) over a target window.
PSINet      - reuses a SpliceNet trunk over four splice-site windows of a
              cassette event and regresses per-tissue PSI.
"""
import torch, torch.nn as nn, torch.nn.functional as F


class ResBlock(nn.Module):
    def __init__(self, ch, k, d):
        super().__init__()
        pad = d * (k - 1) // 2
        self.bn1 = nn.BatchNorm1d(ch); self.c1 = nn.Conv1d(ch, ch, k, dilation=d, padding=pad)
        self.bn2 = nn.BatchNorm1d(ch); self.c2 = nn.Conv1d(ch, ch, k, dilation=d, padding=pad)

    def forward(self, x):
        h = self.c1(F.relu(self.bn1(x)))
        h = self.c2(F.relu(self.bn2(h)))
        return x + h


# (kernel, dilation) schedule per context size, as in SpliceAI
SCHEDULES = {
    80:    [(11, 1)] * 4,
    400:   [(11, 1)] * 4 + [(11, 4)] * 4,
    2000:  [(11, 1)] * 4 + [(11, 4)] * 4 + [(21, 10)] * 4,
    10000: [(11, 1)] * 4 + [(11, 4)] * 4 + [(21, 10)] * 4 + [(41, 25)] * 4,
}


class SpliceNet(nn.Module):
    """context = total flanking nucleotides (half on each side of the target)."""

    def __init__(self, context=2000, ch=32, n_out=3):
        super().__init__()
        assert context in SCHEDULES, f"context must be one of {sorted(SCHEDULES)}"
        self.context = context
        self.stem = nn.Conv1d(4, ch, 1)
        self.skip0 = nn.Conv1d(ch, ch, 1)
        blocks, skips = [], []
        sched = SCHEDULES[context]
        for i, (k, d) in enumerate(sched):
            blocks.append(ResBlock(ch, k, d))
            skips.append(nn.Conv1d(ch, ch, 1) if (i + 1) % 4 == 0 else None)
        self.blocks = nn.ModuleList(blocks)
        self.skips = nn.ModuleList([s if s is not None else nn.Identity() for s in skips])
        self.skip_at = [(i + 1) % 4 == 0 for i in range(len(sched))]
        self.head = nn.Conv1d(ch, n_out, 1)

    def trunk(self, x):
        h = self.stem(x)
        acc = self.skip0(h)
        for i, blk in enumerate(self.blocks):
            h = blk(h)
            if self.skip_at[i]:
                acc = acc + self.skips[i](h)
        return acc

    def forward(self, x):
        """x: (B, 4, target + context) -> logits (B, 3, target)."""
        acc = self.trunk(x)
        c = self.context // 2
        if c > 0:
            acc = acc[:, :, c:-c]
        return self.head(acc)


class PSINet(nn.Module):
    """Four fixed windows (C1 donor, A acceptor, A donor, C2 acceptor) plus
    scalar geometry features -> per-tissue PSI logits."""

    def __init__(self, n_tissues, context=400, ch=32, win=400, hidden=256):
        super().__init__()
        self.trunk = SpliceNet(context=context, ch=ch)
        self.win = win
        self.pool = nn.AdaptiveAvgPool1d(8)
        feat = 4 * ch * 8
        self.geom = nn.Sequential(nn.Linear(6, 32), nn.ReLU(), nn.Linear(32, 32))
        self.head = nn.Sequential(
            nn.Linear(feat + 32, hidden), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(hidden, hidden), nn.ReLU(), nn.Dropout(0.2),
        )
        self.out_tissue = nn.Linear(hidden, n_tissues)
        self.out_mean = nn.Linear(hidden, 1)

    def forward(self, wins, geom):
        """wins: (B, 4, 4, L) four one-hot windows. geom: (B, 6)."""
        B, W = wins.shape[0], wins.shape[1]
        x = wins.reshape(B * W, wins.shape[2], wins.shape[3])
        h = self.trunk.trunk(x)
        h = self.pool(h).reshape(B, -1)
        g = self.geom(geom)
        z = self.head(torch.cat([h, g], 1))
        return self.out_tissue(z), self.out_mean(z).squeeze(-1)


class RBPBindingNet(nn.Module):
    """PSINet trunk plus a per-RBP term on that RBP's own predicted binding.

    Each output k gets its own weights over the binding regions of RBP k, so
    the model can use "is RBP k bound near this exon" directly rather than
    having to infer RBP identity from a shared feature vector.
    """

    def __init__(self, n_rbps, n_regions=6, context=2000, ch=32, win=400, hidden=256):
        super().__init__()
        self.base = PSINet(n_tissues=n_rbps, context=context, ch=ch, win=win, hidden=hidden)
        self.bind_w = nn.Parameter(torch.zeros(n_rbps, n_regions))
        self.bind_b = nn.Parameter(torch.zeros(n_rbps))

    def forward(self, wins, geom, bind=None):
        logit, mean = self.base(wins, geom)
        if bind is not None and bind.dim() == 3:
            # bind: (B, n_regions, n_rbps) -> (B, n_rbps)
            logit = logit + torch.einsum("brk,kr->bk", bind, self.bind_w) + self.bind_b
        return logit, mean
