#!/usr/bin/env python3
"""
Ion Works script: Translation Start Site (TSS/TLS) predictor (sequence-only)

Strand rules:
- track_strand = 0 or +1 → positive (scan as-provided)
- track_strand = -1     → reverse strand (scan REVERSED sequence only)

Key guarantees:
- Sequence is reversed ONLY if strand == -1
- NO reverse-complement is ever used
- Coordinates are ALWAYS returned in standard genomic direction (left → right)
- strand in results is numeric: +1 or -1
- keep_top_per_overlap_cluster is fixed at 10000

precision promoter targeting, safer regulation, and isoform-aware therapy.
precision promoter targeting, safer regulation, and isoform-aware therapy.
precision promoter targeting, safer regulation, and isoform-aware therapy.
precision promoter targeting, safer regulation, and isoform-aware therapy.
precision promoter targeting, safer regulation, and isoform-aware therapy.

"""

from ion import works
import os
import re
import json
from typing import List, Dict, Tuple, Optional

import numpy as np

# ----------------------------
# Params
# ----------------------------

sequence = works.param(1)
if sequence is None:
    raise RuntimeError("sequence (param 1) is required.")
sequence = str(sequence)

min_prob = float(works.param(2)) if works.param(2) is not None else 0.0
max_candidates = int(works.param(3)) if works.param(3) is not None else 100000

# Strand: -1 => reverse; 0/+1 => positive
track_strand = int(works.param(4)) if works.param(4) is not None else 1
track_strand = -1 if track_strand < 0 else 1

keep_top_per_overlap_cluster = 10000

# ----------------------------
# Sequence utils
# ----------------------------

def clean_sequence(seq: str) -> str:
    seq = seq.strip().upper().replace("U", "T")
    return re.sub(r"[^ACGTN]", "", seq)

def reverse_seq(seq: str) -> str:
    """Reverse only (NOT reverse-complement)."""
    return seq[::-1]

def onehot(seq: str) -> np.ndarray:
    mapping = {"A": 0, "C": 1, "G": 2, "T": 3}
    x = np.zeros((len(seq), 4), dtype=np.float32)
    for i, ch in enumerate(seq):
        j = mapping.get(ch)
        if j is not None:
            x[i, j] = 1.0
    return x

def fixed_window(seq: str, center: int, left: int, right: int) -> str:
    start = center - left
    end = center + 3 + right
    pad_left = max(0, -start)
    pad_right = max(0, end - len(seq))
    start = max(0, start)
    end = min(len(seq), end)
    w = ("N" * pad_left) + seq[start:end] + ("N" * pad_right)
    target = left + 3 + right
    return (w + "N" * target)[:target]

def find_candidates(seq: str, codons: List[str], cap: int) -> List[int]:
    pat = "|".join(re.escape(c) for c in codons)
    if not pat:
        return []
    rx = re.compile(pat)
    out: List[int] = []
    for m in rx.finditer(seq):
        out.append(m.start())
        if len(out) >= cap:
            break
    return out

# ----------------------------
# Reverse-only coordinate mapping
# ----------------------------

def map_reverse_to_provided(
    L: int, codon_pos0: int, win_start: int, win_end: int
) -> Tuple[int, int, int]:
    codon_prov = L - (codon_pos0 + 3)
    ws_prov = L - win_end
    we_prov = L - win_start
    return int(codon_prov), int(ws_prov), int(we_prov)

# ----------------------------
# Overlap clustering
# ----------------------------

def keep_top_n_per_overlap_cluster(results: List[Dict], n_keep: int) -> List[Dict]:
    if not results or n_keep <= 0:
        return results

    results = sorted(results, key=lambda r: (r["win_start"], r["win_end"]))

    clusters: List[List[Dict]] = []
    cur: List[Dict] = []
    cur_end: Optional[int] = None

    for r in results:
        s, e = r["win_start"], r["win_end"]
        if not cur or s < cur_end:
            cur.append(r)
            cur_end = max(cur_end or 0, e)
        else:
            clusters.append(cur)
            cur = [r]
            cur_end = e
    if cur:
        clusters.append(cur)

    kept: List[Dict] = []
    for cl in clusters:
        ranked = sorted(
            cl,
            key=lambda r: (-r["prob"], r["codon_pos0"])
        )
        kept.extend(ranked[:n_keep])

    return sorted(kept, key=lambda r: (-r["prob"], r["codon_pos0"]))

# ----------------------------
# Load model
# ----------------------------

MODEL_PT = os.path.join(os.path.dirname(__file__), "model.pt")
MODEL_META = os.path.join(os.path.dirname(__file__), "model_meta.json")

with open(MODEL_META, "r") as f:
    meta = json.load(f)

codons = meta.get("codons", ["ATG"])
left = int(meta.get("left", 100))
right = int(meta.get("right", 100))
win_len = left + 3 + right

import torch
import torch.nn as nn
class SmallCNN(nn.Module):
    def __init__(self, in_ch: int = 4):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(in_ch, 64, kernel_size=7, padding=3),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Conv1d(64, 128, kernel_size=5, padding=2),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Conv1d(128, 128, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.AdaptiveMaxPool1d(1),
        )
        # IMPORTANT: keep this EXACT module structure to match the checkpoint keys
        self.head = nn.Sequential(
            nn.Flatten(),        # head.0
            nn.Linear(128, 64),  # head.1
            nn.ReLU(),           # head.2
            nn.Dropout(0.2),     # head.3  <-- this is what your checkpoint expects
            nn.Linear(64, 1),    # head.4
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        z = self.net(x)
        return self.head(z).squeeze(-1)

device = torch.device("cpu")
model = SmallCNN().to(device)
model.load_state_dict(torch.load(MODEL_PT, map_location=device))
model.eval()

# ----------------------------
# Scoring
# ----------------------------

def score_on_seq(seq: str):
    cands = find_candidates(seq, codons, max_candidates)
    xs, cods, wss, wes = [], [], [], []

    for c in cands:
        w = fixed_window(seq, c, left, right)
        x = torch.from_numpy(onehot(w)).transpose(0, 1)
        xs.append(x)
        cods.append(seq[c:c+3])
        wss.append(max(0, c - left))
        wes.append(min(len(seq), c + 3 + right))

    if not xs:
        return [], [], [], [], np.array([])

    batch = torch.stack(xs).to(device)
    with torch.no_grad():
        probs = torch.sigmoid(model(batch)).cpu().numpy()

    return cands, cods, wss, wes, probs

# ----------------------------
# Run (strand-aware)
# ----------------------------

seq_provided = clean_sequence(sequence)
L = len(seq_provided)

seq_scan = reverse_seq(seq_provided) if track_strand == -1 else seq_provided
orientation = "reverse_of_provided" if track_strand == -1 else "as_provided"

all_results: List[Dict] = []

cands, cods, wss, wes, probs = score_on_seq(seq_scan)

for c, cod, ws, we, p in zip(cands, cods, wss, wes, probs):
    if p < min_prob:
        continue

    if track_strand == -1:
        codon_pos0, win_start, win_end = map_reverse_to_provided(L, c, ws, we)
    else:
        codon_pos0, win_start, win_end = c, ws, we

    all_results.append({
        "codon_pos0": codon_pos0,
        "codon": cod,
        "prob": float(p),
        "strand": track_strand,
        "orientation": orientation,
        "win_start": win_start,
        "win_end": win_end,
        "context_left": left,
        "context_right": right,
    })

# ----------------------------
# Post-processing
# ----------------------------

all_results = keep_top_n_per_overlap_cluster(
    all_results, keep_top_per_overlap_cluster
)

all_results.sort(key=lambda r: (-r["prob"], r["codon_pos0"]))
for i, r in enumerate(all_results, 1):
    r["rank_global"] = i
    r["rank_strand"] = i

works.resolve({
    "results": all_results,
    "meta": {
        "sequence_len": L,
        "track_strand": track_strand,
        "n_returned": len(all_results),
        "codons": codons,
        "left": left,
        "right": right,
        "win_len": win_len,
        "notes": [
            "Sequence is reversed ONLY if track_strand == -1",
            "Reverse-complement is never used",
            "Coordinates are always genomic left->right",
            "strand: +1 = positive, -1 = reverse",
        ],
    }
})
