# WHERE TWO PROTEINS ARE ALIKE, NOT JUST HOW MUCH.
#
#     python3 tools/test/protein-blocks.py
#
# "compare the sequence between spag9_mrna and mapk8ip3mrna" reported one identity in a
# panel and drew nothing. The aligner now returns the stretches the alignment is made of,
# on each protein's own residues, so they can be put on the tracks and linked.
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
import bajapyrun

fails = 0
def ok(c, m):
    global fails
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails += 1

# Two proteins sharing two real domains, with unrelated stuff between and around them.
DOM1 = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKR"
DOM2 = "QALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR"
JUNK1 = "WWWWWWCCCCCCWWWWWWCCCCCCWWWWWWCCCCCC"
JUNK2 = "PPPPPPGGGGGGPPPPPPGGGGGGPPPPPPGGGGGG"

a = DOM1 + JUNK1 + DOM2
# The same two domains, a few substitutions in, with a different spacer and a long tail.
b = ("MMMMMMMMMM" + DOM1.replace("Q", "E", 3) + JUNK2 + JUNK2 + DOM2.replace("L", "I", 4)
     + "YYYYYYYYYYYYYYYYYYYY")

res = bajapyrun.run('py/bio/protein/align-proteins.py',
                    [[{"name": "A_mRNA", "seq": a}, {"name": "B_mRNA", "seq": b}],
                     {"mode": "local"}])
ok(res.get('status') == 'OK', 'the aligner ran: ' + str(res.get('error') or 'OK'))
pair = (res.get('pairs') or [{}])[0]
blocks = pair.get('blocks') or []
print('     blocks: ' + json.dumps([{k: b[k] for k in ('n','a0','a1','b0','b1')} | {'id': round(b['identity'], 3)} for b in blocks]))

ok(len(blocks) >= 2, 'both shared domains come back as blocks (%d)' % len(blocks))
ok(all(b['identity'] >= 0.35 for b in blocks), 'no block is below the identity floor')
ok(all(b['a1'] - b['a0'] + 1 >= 8 for b in blocks), 'no block is too short to mean anything')
ok(all(bk['a1'] < len(a) and bk['b1'] < len(b) for bk in blocks),
   'every residue range is inside its own protein')
ok([x['n'] for x in blocks] == sorted(x['n'] for x in blocks)
   and [x['a0'] for x in blocks] == sorted(x['a0'] for x in blocks),
   'blocks are numbered left to right along the first protein')

# The first block is the first domain, which starts at 0 on A and after the 10-residue
# lead-in on B. Within a residue or two either way: the aligner decides the exact edges.
first = blocks[0]
ok(first['a0'] <= 3 and 8 <= first['b0'] <= 12,
   'the first block lands on the first shared domain (a0=%d b0=%d)' % (first['a0'], first['b0']))
# The junk between them is NOT bridged into one block: that is the whole point of
# breaking at a long gap run.
ok(len(blocks) >= 2 and blocks[1]['a0'] > first['a1'],
   'the unrelated spacer is not swallowed into one long block')

# A gap of a residue or two inside a domain must not shatter it.
c = DOM1[:40] + DOM1[42:]
res2 = bajapyrun.run('py/bio/protein/align-proteins.py',
                     [[{"name": "A", "seq": DOM1}, {"name": "C", "seq": c}], {"mode": "local"}])
b2 = (res2.get('pairs') or [{}])[0].get('blocks') or []
ok(len(b2) == 1, 'a two-residue deletion inside a domain keeps it one block (%d)' % len(b2))

print('\n' + (str(fails) + ' failed') if fails else '\nall assertions passed')
sys.exit(1 if fails else 0)
