# THE PLANNER'S ANSWER, HOWEVER IT ARRIVES.
#
#     python3 tools/test/plan-json.py
#
# "add rna binding proteins to the spag9_mrna" came back as
# "Could not read that: Extra data: line 13 column 1 (char 366)". That is json.loads
# refusing a document with anything after the value: the reply held a perfectly good plan
# and one stray line behind it, and the whole request was lost over the stray line.
import os, sys, json, types, re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))

# plan.py imports its client at module level; stub what it needs so the parser can be
# exercised without reaching anything.
sys.modules['ion'] = types.ModuleType('ion')
sys.modules['ion'].works = types.SimpleNamespace(param=lambda i: None, resolve=lambda d: None)
cc = types.ModuleType('claude_chat')
class _C:
    def __init__(self, *a, **k): pass
cc.Claude = _C
sys.modules['claude_chat'] = cc

src = open('py/bio/editor/plan.py').read()
mod = types.ModuleType('plan')
mod.__dict__['__name__'] = 'plan'
exec(compile(src, 'py/bio/editor/plan.py', 'exec'), mod.__dict__)
first = mod._first_json_object

fails = 0
def ok(c, m):
    global fails
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails += 1

PLAN = '{"steps": [{"capability": "load_rbp", "args": {"track": "SPAG9_mRNA"}}], "explain": "x"}'

# The one that broke it: a good plan with something after it.
r = first(PLAN + '\n\n{"note": "also consider ..."}')
ok(r.get('steps')[0]['capability'] == 'load_rbp',
   'a second object after the plan is ignored, not fatal: ' + json.dumps(r)[:60])

r = first(PLAN + '\nThat should do it.')
ok(r.get('explain') == 'x', 'and so is a line of prose after it')

r = first('Here is the plan:\n' + PLAN)
ok(r.get('explain') == 'x', 'prose BEFORE it is skipped too')

r = first('```json\n' + PLAN + '\n```')
ok(r.get('explain') == 'x', 'a fenced block is unwrapped')

r = first('```\n' + PLAN + '\n```\nnotes')
ok(r.get('explain') == 'x', 'fenced, with trailing notes')

r = first(PLAN)
ok(r.get('explain') == 'x', 'and the ordinary case still reads as it did')

# Nested braces must not confuse it: the value ends where the object ends.
NEST = '{"steps": [{"capability": "a", "args": {"x": {"y": [1, 2, {"z": "}"}]}}}], "explain": "{}"}'
r = first(NEST + '\ntrailing')
ok(r['steps'][0]['args']['x']['y'][2]['z'] == '}',
   'a brace inside a string does not end the object early')

# What cannot be read is said in words a person can act on, not as a parser's complaint.
for bad, why in [('', 'nothing'), ('no json here', 'no JSON'), ('{"a": ', 'truncated'),
                 ('[1,2,3]', 'an array')]:
    try:
        first(bad)
        ok(False, 'it refuses ' + why)
    except ValueError as e:
        ok('Extra data' not in str(e) and len(str(e)) > 10,
           'it refuses ' + why + ' in plain words: ' + str(e))

print(('\n%d failed' % fails) if fails else '\nall assertions passed')
sys.exit(1 if fails else 0)
