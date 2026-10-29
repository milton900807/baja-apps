// Compile app modules the way the engine does (lib/core.js + the module body, in one async function)
// and report any that fail, e.g. "Identifier 'status' has already been declared".
//   node lioncheck.js /opt/baja-apps                      every .js under baja/ and manchester/
//   node lioncheck.js /opt/baja-apps baja/x/y.js ...      just these
const fs = require('fs'), path = require('path');
const root = process.argv[2] || '.';
const core = fs.readFileSync(path.join(root, 'lib/core.js'), 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let files = process.argv.slice(3);
if (!files.length) {
  const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const r = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(r); } else if (e.name.endsWith('.js')) files.push(r); } };
  for (const d of ['baja', 'manchester']) if (fs.existsSync(path.join(root, d))) walk(d);
}
let bad = 0;
for (const f of files) {
  let src = fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, '').trim();
  let args = [], body = src;
  if (src.startsWith('function')) {
    args = src.substring(src.indexOf('(') + 1, src.indexOf(')')).split(',').map((s) => s.trim()).filter(Boolean);
    body = src.substring(src.indexOf('{') + 1, src.lastIndexOf('}'));
  }
  try { new AF('lion_engine', ...args, core + '\n\n' + body); }
  catch (e) { if (/already been declared/.test(e.message)) { bad++; console.log('FAIL', f, '-', e.message); } }
}
console.log(bad ? bad + ' module(s) clash with lib/core.js' : 'no clashes with lib/core.js in ' + files.length + ' modules');
