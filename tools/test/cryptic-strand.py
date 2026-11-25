#!/usr/bin/env python3
"""A STRAND THAT IS NOT A LITERAL IS STILL A STRAND.

    python3 tools/test/cryptic-strand.py

Two bugs, one in each cryptic exon finder, mirrored.

The human script compared works.param(5) against the INTEGER -1. Parameters arrive as
strings, so "-1" never matched: every minus-strand gene was scanned with plus-strand
motifs and the only sign was an empty result. The mouse script compared against the
literal "+", so a caller passing 1 -- which is what a track's strand is -- fell to the
else, and every PLUS-strand gene was scanned with minus-strand motifs.

And both had the motifs wrong. The scanners state their own contract: `acceptor` ends at
exon_start, `donor` starts at exon_end. On the plus-strand text of a MINUS-strand gene the
exon is flanked by AC on the left (the donor's reverse complement) and CT on the right
(the acceptor's), so AC|EXON|CT. The human file said "TG"/"GA", the plain reverse rather
than the reverse complement; the mouse file had the right pair the wrong way round.
"""
import re
import sys

fails = 0


def ok(cond, msg):
    global fails
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails += 1


SRC = {
    "human": open("py/splicing/cryptic-exon-finder.py", encoding="utf-8").read(),
    "mouse": open("py/splicing/cryptic-exon-finder-mm9.py", encoding="utf-8").read(),
}

# The predicate, lifted from each file and run, rather than restated here.
for name, src in SRC.items():
    m = re.search(r"def _is_minus\(v\):\n(?:.*\n)*?\s*return t in \([^)]*\)", src)
    ok(bool(m), name + ": the strand test is a named predicate, not an inline comparison")
    if not m:
        continue
    import textwrap
    ns = {}
    exec(textwrap.dedent(m.group(0)), ns)
    is_minus = ns["_is_minus"]

    # WHAT A TRACK ACTUALLY PASSES. t.strand is a number, and params arrive stringified.
    for v in (-1, "-1", " -1 ", "-", "minus", "Reverse"):
        ok(is_minus(v) is True, name + ": " + repr(v) + " is the minus strand")
    for v in (1, "1", "+", "plus", None, ""):
        ok(is_minus(v) is False, name + ": " + repr(v) + " is not")

# AC|EXON|CT on the minus strand, in both files, matching the scanner contract each one
# states at the top of itself.
for name, src in SRC.items():
    pairs = re.findall(r'acceptor, donor = "(\w\w)", "(\w\w)"', src)
    ok(("AG", "GT") in pairs, name + ": plus strand is AG|EXON|GT")
    ok(("AC", "CT") in pairs, name + ": minus strand is AC|EXON|CT")
    ok(("TG", "GA") not in pairs and ("CT", "AC") not in pairs,
       name + ": and neither the plain reverse nor the pair swapped")

# The contract those motifs answer to, still stated in the file they belong to.
ok("acceptor ends at exon_start" in SRC["human"],
   "the scanner still documents which motif sits on which side")

print(("\n%d failed" % fails) if fails else "\nall assertions passed")
sys.exit(1 if fails else 0)
