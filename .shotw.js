const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body style="margin:0;background:#0f2b3f;"></body></html>',
  {url:'https://gene.clinic/',pretendToBeVisual:true});
Object.defineProperty(dom.window,'innerWidth',{value:1200,configurable:true});
Object.defineProperty(dom.window,'innerHeight',{value:420,configurable:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
window.env={apiUrl:''};
const core=fs.readFileSync('lib/core.js','utf8');
const AF=Object.getPrototypeOf(async function(){}).constructor;
const load=async(p,...a)=>{const src=fs.readFileSync(p,'utf8');
 let f;try{f=await new AF('exec','args',core+'\nreturn ('+src+')')(load,{});}catch(e){return await new AF('exec','args',core+'\n'+src)(load,{});}
 return f(...a);};
global.lion_engine={exec:(p,...a)=>load(p,...a)};
(async()=>{
  const w=await load('baja/lib/working.js','Conservation map for SPAG9',
    'Asking Ensembl for the orthologs and their alignments. Ensembl aligns each species when it is asked, so this usually takes half a minute.');
  const el=document.getElementById('baja-working');
  el.querySelector('[data-id="clock"]').textContent='27 seconds';
  fs.writeFileSync('/tmp/claude-0/working.html',
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0f2b3f;">'+el.outerHTML+'</body>');
  console.log('written');
})();
