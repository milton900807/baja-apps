
import pickle, re, numpy as np
from collections import Counter

NT = 'ACGT'
comp_map = str.maketrans({'A':'T','C':'G','G':'C','T':'A'})

def clean_seq(s):
    import re
    return re.sub(r'[^ACGT]', '', str(s).upper())

def revcomp(s): 
    return s.translate(comp_map)[::-1]

def gc_pct(seq):
    return 100.0 * (seq.count('G') + seq.count('C')) / len(seq) if seq else 0.0

def tm_wallace(seq):
    a = seq.count('A'); t = seq.count('T'); g = seq.count('G'); c = seq.count('C')
    return 2*(a+t)+4*(g+c)

def has_long_homopolymer(s, k=5):
    return any(nt*k in s for nt in NT)

def has_3prime_gc_clamp(s, k=1):
    tail = s[-k:] if len(s) >= k else s
    return any(x in tail for x in "GC")

def simple_hairpin_flag(s, stem=4, loop_min=3, loop_max=12):
    def _revcomp(x): return x.translate(comp_map)[::-1]
    n = len(s)
    for i in range(n - (2*stem + loop_min)):
        for l in range(loop_min, min(loop_max, n - i - 2*stem) + 1):
            left = s[i:i+stem]; right = s[i+stem+l:i+2*stem+l]
            if left == _revcomp(right):
                return 1
    return 0

def max_3prime_complementarity(s1,s2,window=6):
    rc2 = revcomp(s2)
    best = 0
    for off in range(-window, window+1):
        end1 = s1[-window:]; end2 = rc2[-window:]
        if off >= 0:
            a = end1[off:]; b = end2[:len(a)]
        else:
            b = end2[-off:]; a = end1[:len(b)]
        run = cur = 0
        for x,y in zip(a,b):
            if x==y: cur += 1; run = max(run, cur)
            else: cur = 0
        best = max(best, run)
    return best

def load_model(pkl_path):
    with open(pkl_path, 'rb') as f:
        return pickle.load(f)

# NOTE: feature extractor must match the training script
def build_feature_funcs(k3_vocab, last2_vocab):
    def seq_features(seq):
        s = clean_seq(seq)
        L = len(s)
        # k3 counts normalized
        k3_counts = np.zeros(len(k3_vocab), dtype=float)
        idx_map = {k:i for i,k in enumerate(k3_vocab)}
        for i in range(L-2):
            k3 = s[i:i+3]
            j = idx_map.get(k3, None)
            if j is not None: k3_counts[j] += 1.0
        if (L-2) > 0: k3_counts /= (L-2)
        # last2 one-hot
        last2 = s[-2:] if L >= 2 else s
        last2_onehot = np.zeros(len(last2_vocab), dtype=float)
        idx2 = {k:i for i,k in enumerate(last2_vocab)}
        if len(last2) == 2 and last2 in idx2:
            last2_onehot[idx2[last2]] = 1.0
        feats = np.concatenate([
            k3_counts,
            np.array([L, gc_pct(s), tm_wallace(s),
                      1.0 if has_3prime_gc_clamp(s) else 0.0,
                      1.0 if has_long_homopolymer(s,5) else 0.0,
                      float(simple_hairpin_flag(s))], dtype=float),
            last2_onehot
        ])
        return feats
    return seq_features

def scan_long_sequence(long_seq, model_bundle, amplicon_range=(70,150),
                       fwd_len_range=(18,24), rev_len_range=(18,24),
                       top_k_each=200):
    s = clean_seq(long_seq)
    n = len(s)
    if n < min(fwd_len_range)+min(amplicon_range):
        return {'error': 'Sequence too short for requested amplicon range.'}

    clf = model_bundle['clf']
    k3_vocab = model_bundle['k3_vocab']
    last2_vocab = model_bundle['last2_vocab']
    seq_features = build_feature_funcs(k3_vocab, last2_vocab)

    def score_primer(seq):
        feats = seq_features(seq)
        import numpy as np
        return float(clf.predict_proba(feats.reshape(1,-1))[0,1])

    fwd_cands = []
    for L in range(fwd_len_range[0], fwd_len_range[1]+1):
        for i in range(0, n-L+1):
            w = s[i:i+L]
            if not (35 <= gc_pct(w) <= 65): continue
            tm = tm_wallace(w)
            if not (58 <= tm <= 68): continue
            if has_long_homopolymer(w, 5): continue
            if simple_hairpin_flag(w): continue
            if not has_3prime_gc_clamp(w): continue
            p = score_primer(w)
            fwd_cands.append({'i': i, 'L': L, 'seq': w, 'tm': tm, 'prob': p})
    fwd_cands = sorted(fwd_cands, key=lambda x: x['prob'], reverse=True)[:top_k_each]

    rev_cands = []
    for L in range(rev_len_range[0], rev_len_range[1]+1):
        for j in range(0, n-L+1):
            w_plus = s[j:j+L]
            w = revcomp(w_plus)
            if not (35 <= gc_pct(w) <= 65): continue
            tm = tm_wallace(w)
            if not (58 <= tm <= 68): continue
            if has_long_homopolymer(w, 5): continue
            if simple_hairpin_flag(w): continue
            if not has_3prime_gc_clamp(w): continue
            p = score_primer(w)
            rev_cands.append({'j': j, 'L': L, 'seq': w, 'tm': tm, 'prob': p})
    rev_cands = sorted(rev_cands, key=lambda x: x['prob'], reverse=True)[:top_k_each]

    if not fwd_cands or not rev_cands:
        return {'error': 'No candidates passed basic filters. Try widening ranges.'}

    best = None
    lo, hi = amplicon_range
    for f in fwd_cands:
        i, Lf = f['i'], f['L']
        for r in rev_cands:
            j, Lr = r['j'], r['L']
            if j <= i: 
                continue
            amplicon = (j + Lr) - i
            if amplicon < lo or amplicon > hi:
                continue
            comp3 = max_3prime_complementarity(f['seq'], r['seq'], window=6)
            if comp3 >= 4:
                continue
            tm_delta = abs(f['tm'] - r['tm'])
            score = f['prob'] + r['prob'] - 0.05*tm_delta - 0.2*comp3
            cand = {
                'forward_seq': f['seq'], 'reverse_seq': r['seq'],
                'forward_start': i, 'reverse_start_plus': r['j'],
                'forward_len': Lf, 'reverse_len': Lr,
                'forward_tm': round(f['tm'],1), 'reverse_tm': round(r['tm'],1),
                'tm_delta': round(tm_delta,1),
                'amplicon_bp': int(amplicon),
                'score': float(score),
                'f_prob': round(float(f['prob']),4),
                'r_prob': round(float(r['prob']),4),
                'max_3prime_compl': int(comp3)
            }
            if (best is None) or (score > best['score']):
                best = cand
    return best if best else {'error': 'No valid primer pairs found.'}
