// Compile modules the way the app loads them: lib/core.js pasted in front of the body.
//   node tools/ops/loadercheck.js lib/core.js <module.js> ...
// A module that declares a name lib/core.js already declares fails here exactly as it fails
// in the browser ("Identifier ... has already been declared").
// Mirrors baja/src/app/functions/function-util.ts getFunction(): new AsyncFunction('lion_engine', ...args, core + '\n\n' + body)
const fs=require('fs');
const strip=(c)=>{const l=c.replace(/^\s+/,''); if(l.startsWith('/*')){const e=l.indexOf('*/'); if(e>=0) return l.slice(e+2).trim();} return c;};
const core=strip(fs.readFileSync(process.argv[2],'utf8'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
let bad=0;
for (const f of process.argv.slice(3)) {
  let src=strip(fs.readFileSync(f,'utf8')).trim();
  const i=src.indexOf('{'), l=src.lastIndexOf('}');
  const args=src.slice(src.indexOf('(')+1, src.indexOf(')')).split(',').map(s=>s.trim()).filter(Boolean);
  const body=src.substring(i+1,l).trim();
  try { new AsyncFunction('lion_engine', ...args, core+'\n\n'+body); console.log('ok   ', f); }
  catch(e){ bad++; console.log('FAIL ', f, '->', e.message); }
}
process.exit(bad?1:0);
