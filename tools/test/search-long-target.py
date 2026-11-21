# A LONG TRACK IS NOT A REASON TO REFUSE TO SEARCH IT.
#
#     python3 tools/test/search-long-target.py
#
# DNM3's genomic track is 571 kb. The searcher refused anything over 400 kb, so every exon
# of DNM1 searched against it returned the same error, and the caller reported twenty-two
# errors as "none of the 22 exons of DNM1 matches anything on DNM3 above the noise floor".
# About two paralogues that is false, and nothing had been compared to find it out.
import os, sys, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
import bajapyrun

fails = 0
def ok(c, m):
    global fails
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails += 1

BASES = "ACGT"

def noise(n, seed):
    r = random.Random(seed)
    return "".join(r.choice(BASES) for _ in range(n))

def diverge(s, p, seed):
    r = random.Random(seed)
    return "".join(r.choice([b for b in BASES if b != c]) if r.random() < p else c for c in s)

def rc(s):
    return "".join({"A": "T", "C": "G", "G": "C", "T": "A"}[c] for c in reversed(s))

def search(q, t, **opts):
    o = {"max_hits": 1, "strands": "both"}
    o.update(opts)
    return bajapyrun.run('py/bio/search-region-in-track.py',
                         [{"name": "exon 1", "seq": q, "offset": 0},
                          {"name": "DNM3", "seq": t, "offset": 0}, o])

# A 520 kb gene track, over the old 400 kb limit, with one exon's worth of paralogous
# sequence planted in it at 73% identity -- about what two paralogous coding exons are.
exon = noise(150, 11)
AT = 455000
target = noise(520000, 3)
target = target[:AT] + diverge(exon, 0.27, 5) + target[AT + 150:]

t0 = time.time()
r = search(exon, target)
secs = time.time() - t0
ok(r.get('status') == 'OK', 'a 520 kb target is searched, not refused: ' + str(r.get('error') or 'OK'))
hits = r.get('hits') or []
ok(len(hits) == 1, 'and the planted exon is found: %d hits' % len(hits))
if hits:
    h = hits[0]
    # Inside the planted copy, covering most of it. Local alignment trims diverged ends,
    # so the edges are the aligner's to decide; what matters is that it is THERE and not
    # somewhere else in half a megabase.
    ok(AT - 5 <= h['start'] and h['end'] <= AT + 155 and (h['end'] - h['start']) >= 80,
       'on the planted copy and covering most of it: %d-%d, planted at %d-%d'
       % (h['start'], h['end'], AT, AT + 150))
    ok(0.6 <= h['identity'] <= 0.85, 'at a paralogous identity: %.0f%%' % (h['identity'] * 100))
    ok(h['strand'] == '+', 'on the strand it was planted on: ' + h['strand'])
    ok(h['score'] > r.get('floor', 0), 'scoring above the noise floor: %.0f vs %.0f'
       % (h['score'], r.get('floor', 0)))
print('     %.1fs, swept %s of the target, partial=%s' % (secs, r.get('swept'), r.get('partial')))
ok(r.get('swept', 0) >= 0.999 and not r.get('partial'),
   'having looked at all of it, which is what lets "no match" mean anything')

# SEEDS MAY NOT SKIP ANYTHING. A hit the k-mer stage misses must still be found: that
# stage is a shortcut, and a shortcut that loses answers is the bug being fixed.
ok(r.get('narrowed') is True, 'the target was over the window, so the fast path was tried')

# The other strand, which is how a paralogous exon often sits in another gene.
target2 = noise(430000, 9)
AT2 = 300000
target2 = target2[:AT2] + rc(diverge(exon, 0.2, 13)) + target2[AT2 + 150:]
r2 = search(exon, target2)
h2 = (r2.get('hits') or [None])[0]
ok(h2 is not None and h2['strand'] == '-', 'a reversed match is found and reported as minus: '
   + (h2['strand'] if h2 else 'no hit'))
ok(h2 is not None and AT2 - 5 <= h2['start'] and h2['end'] <= AT2 + 155,
   'in the right place: %s-%s' % (h2['start'] if h2 else '-', h2['end'] if h2 else '-'))

# AN HONEST NEGATIVE. Unrelated sequence of the same size returns no hits, having swept
# the whole thing: that is the only way "nothing matched" is worth saying.
r3 = search(noise(150, 77), noise(450000, 31))
ok(r3.get('status') == 'OK' and not (r3.get('hits') or []),
   'unrelated sequence matches nothing: %d hits' % len(r3.get('hits') or []))
ok(r3.get('swept', 0) >= 0.999, 'after sweeping all of it, not after giving up')

# Short targets behave exactly as before: one alignment, no windowing.
small = noise(5000, 41)
small = small[:1200] + diverge(exon, 0.1, 17) + small[1350:]
r4 = search(exon, small)
ok(r4.get('status') == 'OK' and (r4.get('hits') or []) and not r4.get('narrowed'),
   'a small target is aligned whole, as it always was')
ok(abs((r4.get('hits') or [{}])[0].get('start', -1) - 1200) <= 4, 'and still found in it')

print('')
print('%d failed' % fails if fails else 'all assertions passed')
sys.exit(1 if fails else 0)
