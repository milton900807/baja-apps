# ddct_analysis.py
from __future__ import annotations
from typing import List, Dict, Any, Tuple, Optional
from statistics import mean, pstdev
import math
import json
from ion import works  # type: ignore

# ------------------------- Helpers -------------------------

def parse_table(paste: str) -> Tuple[List[str], List[Dict[str, str]]]:
    """Parse an Excel-style pasted table (tab-delimited)."""
    lines = [ln.strip("\r") for ln in paste.strip().split("\n") if ln.strip()]
    if not lines:
        return [], []
    header = [h.strip() for h in lines[0].split("\t")]
    rows: List[Dict[str, str]] = []
    for ln in lines[1:]:
        parts = ln.split("\t")
        # pad to header length
        if len(parts) < len(header):
            parts += [""] * (len(header) - len(parts))
        row = {header[i]: parts[i].strip() if i < len(parts) else "" for i in range(len(header))}
        rows.append(row)
    return header, rows

def to_float(x: str) -> Optional[float]:
    try:
        if x is None:
            return None
        s = str(x).strip().replace(",", "")
        if s == "" or s.lower() in {"na", "nan", "null"}:
            return None
        return float(s)
    except Exception:
        return None

def tsv(headers: List[str], rows: List[Dict[str, Any]]) -> str:
    out = ["\t".join(headers)]
    for r in rows:
        out.append("\t".join("" if r.get(h) is None else str(r.get(h)) for h in headers))
    return "\n".join(out)

def group_by(keys: Tuple[str, ...], rows: List[Dict[str, str]]) -> Dict[Tuple[str, ...], List[Dict[str, str]]]:
    g: Dict[Tuple[str, ...], List[Dict[str, str]]] = {}
    for r in rows:
        k = tuple(r.get(k, "") for k in keys)
        g.setdefault(k, []).append(r)
    return g

def grubbs_outliers(values: List[float], alpha: float = 0.05) -> List[int]:
    """
    Simple Grubbs test for single outliers, iterated greedily.
    Returns indices of outliers in the original 'values' list.
    """
    # Precompute t critical via approximation (n is small for qPCR replicates).
    # We avoid external deps; use critical G from t-dist approximation:
    # Gcrit = ((n-1)/sqrt(n)) * sqrt(t^2 / (n-2 + t^2)), where t is t_{alpha/(2n), n-2}
    try:
        import math
    except Exception:
        pass

    def t_approx(p: float, df: int) -> float:
        # Wilson-Hilferty / simple approximation for t critical (ok for small replicate counts)
        # For robustness, clamp
        p = max(min(p, 0.4999), 1e-6)
        # Invert normal quantile approx:
        # Using Abramowitz-Stegun for simplicity:
        from math import sqrt, log
        # normal inverse approx
        a1,a2,a3 = -39.69683028665376, 220.9460984245205, -275.9285104469687
        b1,b2,b3 = -54.47609879822406, 161.5858368580409, -155.6989798598866
        c1,c2,c3 = 0.007784894002430293, 0.3223964580411365, 2.445134137142996
        d1,d2 = 0.010328, 0.089

        q = 2*p
        if q < 0.02425:
            r = math.sqrt(-2.0*math.log(q))
            z = (((c1*r + c2)*r + c3)*r + 0)/(((d1*r + d2)*r + 1))
        elif q > 1-0.02425:
            r = math.sqrt(-2.0*math.log(1-q))
            z = -(((c1*r + c2)*r + c3)*r + 0)/(((d1*r + d2)*r + 1))
        else:
            r = q - 0.5
            s = r*r
            z = (((a3*s + a2)*s + a1)*r)/((((b3*s + b2)*s + b1)*s + 1))
        # convert z to t via simple df correction:
        return z * math.sqrt(df/(max(df-2,1)))  # crude but acceptable for small n
    out_idx: List[int] = []
    vals = values[:]
    idx_map = list(range(len(values)))
    while len(vals) >= 3:
        mu = sum(vals)/len(vals)
        sd = math.sqrt(sum((v-mu)**2 for v in vals)/len(vals))
        if sd == 0:
            break
        deviations = [abs(v - mu) for v in vals]
        i_max = max(range(len(vals)), key=lambda i: deviations[i])
        G = deviations[i_max] / sd
        n = len(vals)
        t = t_approx(alpha/(2*n), n-2)
        Gcrit = ((n-1)/math.sqrt(n)) * math.sqrt(t*t / (n-2 + t*t))
        if G > Gcrit:
            out_idx.append(idx_map[i_max])
            # remove
            del vals[i_max]
            del idx_map[i_max]
        else:
            break
    return sorted(out_idx)

# ------------------------- Core Analysis -------------------------

def compute_replicate_stats(rows: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """
    For each (Sample, Target), compute replicate stats on Cq.
    Uses 'Cq Mean' column if present and valid; otherwise recomputes from 'Cq'.
    """
    groups = group_by(("Sample", "Target"), rows)
    out: List[Dict[str, Any]] = []
    for (sample, target), group in groups.items():
        cqs: List[float] = []
        for r in group:
            # Prefer raw Cq if available, else use Cq Mean for singletons
            cq_raw = to_float(r.get("Cq", ""))
            if cq_raw is not None:
                cqs.append(cq_raw)
            else:
                cq_mean = to_float(r.get("Cq Mean", ""))
                if cq_mean is not None:
                    cqs.append(cq_mean)
        if not cqs:
            continue
        # Outliers via Grubbs (optional, report only; do not remove in mean unless stated)
        outlier_idx = grubbs_outliers(cqs, alpha=0.05)
        n = len(cqs)
        mu = sum(cqs)/n
        sd = math.sqrt(sum((x-mu)**2 for x in cqs)/n) if n > 1 else 0.0
        cv = (sd/mu*100.0) if mu else None
        out.append({
            "Sample": sample,
            "Target": target,
            "N": n,
            "Cq_Mean": round(mu, 6),
            "Cq_SD": round(sd, 6),
            "Cq_CV_pct": None if cv is None else round(cv, 3),
            "Outlier_Indices_0based": ",".join(map(str, outlier_idx)) if outlier_idx else "",
        })
    return out

def ddct(
    replicate_stats: List[Dict[str, Any]],
    control_sample: Optional[str],
    reference_target: Optional[str]
) -> List[Dict[str, Any]]:
    """
    Compute ΔCq, ΔΔCq, and fold change 2^-ΔΔCq.
    - If reference_target is provided, ΔCq = Cq(target) - Cq(reference) within the same sample.
    - If not, ΔCq = Cq(target) (i.e., singleplex or pre-normalized).
    - If control_sample provided, ΔΔCq is vs. that sample; else ΔΔCq is vs. global mean ΔCq of all samples.
    """
    # Build lookup: (Sample, Target) -> Cq_Mean
    lut = {(r["Sample"], r["Target"]): float(r["Cq_Mean"]) for r in replicate_stats}
    # For each sample, compute ΔCq per target
    samples = sorted({r["Sample"] for r in replicate_stats})
    targets = sorted({r["Target"] for r in replicate_stats})
    # If reference_target provided, ensure present
    if reference_target and reference_target not in targets:
        # proceed but results will be missing ΔCq for samples lacking reference
        pass

    # First pass: ΔCq
    deltas: Dict[Tuple[str, str], float] = {}
    for s in samples:
        ref_cq = lut.get((s, reference_target)) if reference_target else None
        for t in targets:
            cq = lut.get((s, t))
            if cq is None:
                continue
            if reference_target:
                if ref_cq is None:
                    # cannot compute ΔCq without reference for this sample
                    continue
                delta = cq - ref_cq
            else:
                delta = cq
            deltas[(s, t)] = delta

    # Calibrator: control_sample or global mean ΔCq per target (or per (target) when ref exists)
    ddct_rows: List[Dict[str, Any]] = []
    for t in targets:
        # find calibrator ΔCq
        if control_sample and (control_sample, t) in deltas:
            calibrator_delta = deltas[(control_sample, t)]
        else:
            # global mean ΔCq for this target across samples available
            vals = [v for (s, tt), v in deltas.items() if tt == t]
            calibrator_delta = sum(vals)/len(vals) if vals else None

        for s in samples:
            key = (s, t)
            if key not in deltas or calibrator_delta is None:
                continue
            delta = deltas[key]
            dd = delta - calibrator_delta
            fold = 2 ** (-dd)
            ddct_rows.append({
                "Sample": s,
                "Target": t,
                "DeltaCq": round(delta, 6),
                "DeltaDeltaCq": round(dd, 6),
                "FoldChange_2^-DeltaDeltaCq": round(fold, 6),
                "Calibrator": control_sample if control_sample else "GlobalMean",
                "ReferenceTarget": reference_target if reference_target else "",
            })
    return ddct_rows

# ------------------------- Entrypoint -------------------------

def main() -> int:
    try:
        import_table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing required parameter 1: import_table (Excel-style paste string)."})
        return 1

    # Optional: control sample (calibrator) and reference target (housekeeping)
    try:
        control_sample = str(works.param(2) or "").strip() or None
    except Exception:
        control_sample = None
    try:
        reference_target = str(works.param(3) or "").strip() or None
    except Exception:
        reference_target = None

    source_text = str(import_table or "")
    header, rows = parse_table(source_text)
    if not header:
        works.resolve({"status": "❌ error", "error": "Input has no headers."})
        return 1

    # Compute replicate stats
    rep = compute_replicate_stats(rows)
    rep_headers = ["Sample","Target","N","Cq_Mean","Cq_SD","Cq_CV_pct","Outlier_Indices_0based"]
    rep_tsv = tsv(rep_headers, rep)

    # Compute ΔΔCq
    dd = ddct(rep, control_sample, reference_target)
    dd_headers = ["Sample","Target","DeltaCq","DeltaDeltaCq","FoldChange_2^-DeltaDeltaCq","Calibrator","ReferenceTarget"]
    dd_tsv = tsv(dd_headers, dd) if dd else ""

    works.resolve({
        "status": "✅ ok",
        "summary": {
            "replicate_groups": len(rep),
            "targets": sorted({r["Target"] for r in rep}),
            "samples": sorted({r["Sample"] for r in rep}),
            "calibrator": control_sample or "GlobalMean",
            "reference_target": reference_target or "",
        },
        "tables": {
            "replicate_stats_tsv": rep_tsv,
            "ddct_tsv": dd_tsv
        }
    })
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
