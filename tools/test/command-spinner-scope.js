// THE RUNNING STRIP MUST BE REACHABLE FROM EVERY WAY OF STARTING WORK.
//
//     node tools/test/command-spinner-scope.js
//
// "go_to_position: Cannot access withSpinner before initialization" is what a user saw
// when they pressed GO on the card that offers one step on several tracks. The helper was
// declared partway down render(), BELOW a branch that returns: on that path the
// declaration is never reached, so the button closed over a const in its temporal dead
// zone and died naming the operation, which reads as the operation being broken rather
// than the panel around it.
//
// This is a structural bug, so it is checked structurally: every use of the helper must
// come after its declaration in the file, and the declaration must sit outside the
// function whose early return skipped it.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
const lines = src.split('\n');
const lineOf = (rx) => { for (let i = 0; i < lines.length; i++) if (rx.test(lines[i])) return i + 1; return -1; };
const allLines = (rx) => { const out = []; for (let i = 0; i < lines.length; i++) if (rx.test(lines[i])) out.push(i + 1); return out; };

const decl = lineOf(/^\s*const withSpinner = async/);
const render = lineOf(/^\s*const render = \(r, ask\) =>/);
const uses = allLines(/(await|=) withSpinner\(/).filter((n) => n !== decl);

ok(decl > 0, 'the helper is declared');
ok(render > 0, 'render is found');
ok(decl < render, 'and it is declared BEFORE render, not inside it: ' + decl + ' vs ' + render);
ok(uses.length >= 3, 'it is used in several places: ' + uses.join(', '));
ok(uses.every((n) => n > decl), 'every use comes after the declaration: ' + uses.join(', '));

// The indentation says it plainly: the declaration sits at render's own level, so no
// branch inside render can skip it.
const indent = (n) => (lines[n - 1].match(/^\s*/) || [''])[0].length;
ok(indent(decl) === indent(render),
   'declared at the same level as render, so nothing inside render can return past it: '
   + indent(decl) + ' vs ' + indent(render));

// The path that failed: the one-step-several-tracks card.
const choiceGo = lineOf(/try \{ await withSpinner\(p0, \(\) => p0\.capability\.run\(o\.args\)\); loggedRan/);
ok(choiceGo > decl, 'the per-track GO button can reach it: ' + choiceGo);

// And the peptide-or-nucleotide card, which starts work that can take a minute.
ok(/withSpinner\(\{ text: o2\.label, capability: o2\.capability \}/.test(src),
   'so can the card that asks which alphabet');

// The reason is written down where the next person will be standing.
ok(/HOISTED OUT OF render ON PURPOSE/.test(src), 'and why it lives there is in the file');

console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
process.exit(fails ? 1 : 0);
