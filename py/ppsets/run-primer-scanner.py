
#!/usr/bin/env python3
import argparse, json, sys, re
from typing import Tuple, Optional

# Imports from the previously saved modules
from primer_ml_scanner import load_model, scan_long_sequence
try:
    from primer_design_helpers import range_from_cell_line
except Exception:
    range_from_cell_line = None

def read_fasta(path: str) -> str:
    """Reads a FASTA file and returns a concatenated uppercase ACGT string of all records."""
    seqs = []
    with open(path, 'r') as f:
        current = []
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('>'):
                if current:
                    seqs.append(''.join(current))
                    current = []
            else:
                current.append(re.sub(r'[^ACGTacgt]', '', line).upper())
        if current:
            seqs.append(''.join(current))
    if not seqs:
        raise ValueError("No sequence found in FASTA.")
    return ''.join(seqs)

def parse_range(s: str) -> Tuple[int,int]:
    """Parses a range like '70-150' into a tuple (70,150)."""
    m = re.match(r'^\s*(\d+)\s*[-,:]\s*(\d+)\s*$', s)
    if not m:
        raise argparse.ArgumentTypeError("Range must look like '70-150'.")
    a, b = int(m.group(1)), int(m.group(2))
    if a >= b:
        raise argparse.ArgumentTypeError("Invalid range: low must be < high.")
    return (a, b)

def main():
    ap = argparse.ArgumentParser(description="Scan a FASTA template and output the best qPCR primer pair.")
    ap.add_argument("--fasta", required=True, help="Path to FASTA file containing the template sequence.")
    ap.add_argument("--model", default="primer_ml_model.pkl", help="Path to trained model pickle.")
    ap.add_argument("--cell-line", default=None, help="Cell line to derive amplicon range (uses stats JSON).")
    ap.add_argument("--stats-json", default="cell_line_primer_model_with_amplicon.json",
                    help="JSON with per-cell-line amplicon stats (used with --cell-line).")
    ap.add_argument("--amp-range", type=parse_range, default=None,
                    help="Amplicon range override, e.g., '70-150'. If provided, overrides --cell-line.")
    ap.add_argument("--fwd-len", type=parse_range, default="18-24",
                    help="Forward primer length range, e.g., '18-24'.")
    ap.add_argument("--rev-len", type=parse_range, default="18-24",
                    help="Reverse primer length range, e.g., '18-24'.")
    ap.add_argument("--top-k", type=int, default=200, help="Top K forward and reverse candidates to consider.")
    args = ap.parse_args()

    # Load model
    model = load_model(args.model)

    # Determine amplicon range
    if args.amp_range is not None:
        amp_range = args.amp_range
    elif args.cell_line and range_from_cell_line is not None:
        amp_range = range_from_cell_line(args.cell_line, args.stats_json, hard_default=(70,150), k=1.0)
    else:
        amp_range = (70, 150)

    # Read FASTA
    long_seq = read_fasta(args.fasta)

    # Scan
    result = scan_long_sequence(
        long_seq,
        model_bundle=model,
        amplicon_range=amp_range,
        fwd_len_range=args.fwd_len if isinstance(args.fwd_len, tuple) else parse_range(str(args.fwd_len)),
        rev_len_range=args.rev_len if isinstance(args.rev_len, tuple) else parse_range(str(args.rev_len)),
        top_k_each=args.top_k
    )

    print(json.dumps({
        "amplicon_range": amp_range,
        "result": result
    }, indent=2))

if __name__ == "__main__":
    main()
