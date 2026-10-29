const fs = require('fs');
const core = fs.readFileSync('/home/claude/baja-apps/lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let bad = 0;
for (const f of process.argv.slice(2)) {
  let src = fs.readFileSync(f, 'utf8').trim();
  let args = [], body = src;
  if (src.startsWith('function')) {
    args = src.substring(src.indexOf('(') + 1, src.indexOf(')')).split(',').map(s => s.trim()).filter(Boolean);
    body = src.substring(src.indexOf('{') + 1, src.lastIndexOf('}'));
  }
  try { new AF('lion_engine', ...args, core + '\n\n' + body); console.log('ok  ', f); }
  catch (e) { bad++; console.log('FAIL', f, e.message); }
}
process.exit(bad ? 1 : 0);
