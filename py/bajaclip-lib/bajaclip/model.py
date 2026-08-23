from __future__ import annotations
import numpy as np
import torch
import torch.nn as nn

# net defs have to match the checkpoint exactly or load_state_dict blows up.
# don't "clean these up" unless you retrain.

BASE_TO_ID = {"A": 0, "C": 1, "G": 2, "T": 3, "U": 3, "N": 4}


class BaseCNN(nn.Module):
    def __init__(self, n_outputs, vocab_size=5, emb_dim=8):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, emb_dim)
        self.net = nn.Sequential(
            nn.Conv1d(emb_dim, 128, kernel_size=9, padding=4), nn.BatchNorm1d(128), nn.ReLU(), nn.MaxPool1d(4),
            nn.Conv1d(128, 256, kernel_size=15, padding=7), nn.BatchNorm1d(256), nn.ReLU(), nn.MaxPool1d(4),
            nn.Conv1d(256, 256, kernel_size=21, padding=10), nn.BatchNorm1d(256), nn.ReLU(),
            nn.AdaptiveMaxPool1d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(), nn.Dropout(0.3), nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.2), nn.Linear(128, n_outputs),
        )

    def forward(self, x):
        x = self.embedding(x).transpose(1, 2)
        return self.head(self.net(x))


class SphereCNN(nn.Module):
    def __init__(self, n_outputs, sphere_dim=4, vocab_size=5, emb_dim=8):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, emb_dim)
        self.net = nn.Sequential(
            nn.Conv1d(emb_dim, 128, kernel_size=9, padding=4), nn.BatchNorm1d(128), nn.ReLU(), nn.MaxPool1d(4),
            nn.Conv1d(128, 256, kernel_size=15, padding=7), nn.BatchNorm1d(256), nn.ReLU(), nn.MaxPool1d(4),
            nn.Conv1d(256, 256, kernel_size=21, padding=10), nn.BatchNorm1d(256), nn.ReLU(),
            nn.AdaptiveMaxPool1d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(), nn.Dropout(0.3), nn.Linear(256 + sphere_dim, 128), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(128, n_outputs),
        )

    def forward(self, x, sphere_x):
        x = self.embedding(x).transpose(1, 2)
        x = torch.flatten(self.net(x), 1)
        return self.head(torch.cat([x, sphere_x], dim=1))


def encode_seq(seq, max_len):
    arr = np.full(max_len, 4, dtype=np.int64)
    seq = seq.upper().replace("U", "T")[:max_len]
    for i, b in enumerate(seq):
        arr[i] = BASE_TO_ID.get(b, 4)
    return arr


def sphere_features(seq, motifs):
    if not motifs:
        return np.zeros(4, dtype=np.float32)
    s = seq.upper().replace("U", "T")
    L = max(1, len(s))
    hits = weighted = max_len_hit = 0
    for m in motifs:
        c = s.count(m)
        if c:
            hits += c
            weighted += c * len(m)
            max_len_hit = max(max_len_hit, len(m))
    gc = (s.count("G") + s.count("C")) / L
    return np.array([hits / L, weighted / L, max_len_hit / 10.0, gc], dtype=np.float32)


class BajaCLIP:
    def __init__(self, ckpt_path, device="auto"):
        self.device = ("cuda" if torch.cuda.is_available() else "cpu") if device == "auto" else device
        # weights_only=False: checkpoint carries the protein list + motif dict, not just tensors
        ck = torch.load(ckpt_path, map_location=self.device, weights_only=False)
        self.proteins = [str(p) for p in ck["proteins"]]
        self.max_len = int(ck["max_len"])
        self.model_type = ck.get("model_type", "sphere_cnn")
        self.motifs = [m for m in ck.get("sphere_motifs", []) if len(m) <= self.max_len]
        self.is_sphere = self.model_type.startswith("sphere")
        n = len(self.proteins)
        self.model = (SphereCNN(n) if self.is_sphere else BaseCNN(n)).to(self.device)
        self.model.load_state_dict(ck["model_state_dict"])
        self.model.eval()
        self.idx = {p.upper(): i for i, p in enumerate(self.proteins)}

    def score_windows(self, windows, batch_size=1024):
        # windows -> (N, n_proteins) sigmoid probs
        out = np.zeros((len(windows), len(self.proteins)), dtype=np.float32)
        with torch.no_grad():
            for i in range(0, len(windows), batch_size):
                b = windows[i:i + batch_size]
                x = torch.tensor(np.stack([encode_seq(w, self.max_len) for w in b]),
                                 dtype=torch.long, device=self.device)
                if self.is_sphere:
                    sx = torch.tensor(np.stack([sphere_features(w, self.motifs) for w in b]),
                                      dtype=torch.float32, device=self.device)
                    y = self.model(x, sx)
                else:
                    y = self.model(x)
                out[i:i + len(b)] = torch.sigmoid(y).cpu().numpy()
        return out
