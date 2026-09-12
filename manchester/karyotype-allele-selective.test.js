// WHICH ALLELE TO AIM AT, tested rather than read.  node manchester/karyotype-allele-selective.test.js
//
// The three site-finders decide which of two copies an oligo should destroy, and the
// phased one decides it by reading a genotype's phase off a disease variant several
// kilobases away. Getting that backwards produces a result that looks entirely normal --
// the same count of sites, in the same genes, with plausible sequence -- and is aimed at
// the copy that must survive. There is nothing on the screen that would show it.
//
// So the functions are pulled out of karyotype.js verbatim (they live inside its closure
// and cannot be imported) and run against a synthetic chromosome whose right answers are
// known by construction. If a `const` here is renamed there, the grab fails loudly.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'karyotype.js'), 'utf8');
const grab = (name) => {
    const i = src.indexOf('        const ' + name + ' = (');
    if (i < 0) throw new Error('not found: ' + name);
    // to the matching '\n        };'
    const j = src.indexOf('\n        };', i);
    if (j < 0) throw new Error('no end: ' + name);
    return src.slice(i, j + '\n        };'.length);
};
const body = [grab('asAnchorsIn'), grab('asSitesPhased'), grab('asSitesMutation')].join('\n');

const GT_NONE=0, GT_REF=1, GT_HET=2, GT_HOM=3, GT_HAP2=4, GT_HAP1=5, GT_HOMP=6, GT_OTHER=7;
const AS_MAX_PER_GENE = 24;
const drawn = [{ name: 'chr21' }];
// pos, alleles, cls(1=ClinVar pathogenic), gt for sample 0
const V = [
    { pos: 1100, ref:'A', alt:'G', cls:1, gt:GT_HAP1 },   // the disease variant, on copy 1
    { pos: 1200, ref:'C', alt:'T', cls:0, gt:GT_HAP1 },   // het, SAME copy  -> aim at T (alt)
    { pos: 1300, ref:'G', alt:'A', cls:0, gt:GT_HAP2 },   // het, OTHER copy -> aim at G (ref)
    { pos: 1400, ref:'T', alt:'C', cls:0, gt:GT_HET  },   // unphased het    -> excluded
    { pos: 1500, ref:'A', alt:'AT',cls:0, gt:GT_HAP1 },   // indel           -> excluded
    { pos: 1600, ref:'C', alt:'G', cls:0, gt:GT_HOM  },   // homozygous      -> excluded
];
const cplx = new Map(); V.forEach((v,i)=>{ if(v.ref.length>1||v.alt.length>1) cplx.set(i,[v.ref,v.alt]); });
const vdata = [{ n: V.length, pos: Float64Array.from(V.map(v=>v.pos)),
    cls: Uint8Array.from(V.map(v=>v.cls)), cplx: cplx,
    gts: Uint8Array.from(V.map(v=>v.gt)), gtw: 1 }];
const gtOf = (d,k,si) => (d.gts && si < d.gtw) ? d.gts[k*d.gtw+si] : GT_NONE;
const allelesAt = (ci,k) => { const d=vdata[ci]; if (d.cplx && d.cplx.has(k)) return d.cplx.get(k); return [V[k].ref, V[k].alt]; };

// The three are `const` inside karyotype.js's closure, so they are handed their
// dependencies the same way here rather than eval'd into a scope that cannot see them.
const NAMES = ['vdata','drawn','gtOf','allelesAt','AS_MAX_PER_GENE',
    'GT_NONE','GT_REF','GT_HET','GT_HOM','GT_HAP2','GT_HAP1','GT_HOMP','GT_OTHER'];
const made = new Function(...NAMES, body + '\nreturn { asAnchorsIn, asSitesPhased, asSitesMutation };')(
    vdata, drawn, gtOf, allelesAt, AS_MAX_PER_GENE,
    GT_NONE, GT_REF, GT_HET, GT_HOM, GT_HAP2, GT_HAP1, GT_HOMP, GT_OTHER);
const { asAnchorsIn, asSitesPhased, asSitesMutation } = made;

let fail = 0;
const eq = (what, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail++;
    console.log((ok?'  PASS  ':'  FAIL  ') + what + (ok?'':'\n          got  ' + JSON.stringify(got) + '\n          want ' + JSON.stringify(want)));
};

console.log('--- asAnchorsIn ---');
const anc = asAnchorsIn(0, 1000, 2000, 0, null);
eq('finds the one ClinVar-pathogenic call', anc.map(a=>a.pos), [1100]);
eq('and reads its phase', anc[0].gt, GT_HAP1);
const anc2 = asAnchorsIn(0, 1000, 2000, 0, { variants: [{ pos: 1300 }] });
eq('loss-matrix positions count too', anc2.map(a=>a.pos), [1100, 1300]);

console.log('--- asSitesPhased ---');
const ph = asSitesPhased(0, 1000, 2000, 0, 'TESTG', null);
eq('disease copy is haplotype 1', ph.hap, 'haplotype 1');
eq('sites found', ph.sites.map(s=>s.pos), [1100, 1200, 1300]);
eq('anchor: aim at its alt', ph.sites.find(s=>s.pos===1100).retained, 'alt');
eq('same copy  -> aim at alt', ph.sites.find(s=>s.pos===1200).retained, 'alt');
eq('other copy -> aim at ref', ph.sites.find(s=>s.pos===1300).retained, 'ref');
eq('unphased het excluded', ph.sites.some(s=>s.pos===1400), false);
eq('indel excluded', ph.sites.some(s=>s.pos===1500), false);
eq('homozygous excluded', ph.sites.some(s=>s.pos===1600), false);

console.log('--- asSitesPhased, disease variant on copy 2 ---');
vdata[0].gts[0] = GT_HAP2;
const ph2 = asSitesPhased(0, 1000, 2000, 0, 'TESTG', null);
eq('disease copy is haplotype 2', ph2.hap, 'haplotype 2');
eq('1200 is now the OTHER copy -> ref', ph2.sites.find(s=>s.pos===1200).retained, 'ref');
eq('1300 is now the SAME copy  -> alt', ph2.sites.find(s=>s.pos===1300).retained, 'alt');
vdata[0].gts[0] = GT_HAP1;

console.log('--- asSitesPhased, refusals ---');
vdata[0].cls[2] = 1;                                  // a second disease variant, on copy 2
eq('disease variants on both copies refuses', asSitesPhased(0,1000,2000,0,'TESTG',null).why,
   'disease variants on both copies, so there is no single disease haplotype');
vdata[0].cls[2] = 0;
vdata[0].gts[0] = GT_HET;                             // the disease variant is unphased
eq('unphased disease variant refuses', asSitesPhased(0,1000,2000,0,'TESTG',null).why,
   'carries 1 disease variant, none of them phased');
vdata[0].gts[0] = GT_HAP1;
vdata[0].cls[0] = 0;
eq('no disease variant refuses', asSitesPhased(0,1000,2000,0,'TESTG',null).why,
   'no disease variant in it to phase against');
vdata[0].cls[0] = 1;

console.log('--- asSitesMutation ---');
const mu = asSitesMutation(0, 1000, 2000, 0, 'TESTG', null);
eq('the mutation itself', mu.sites.map(s=>s.pos), [1100]);
eq('aim at the mutant allele', mu.sites[0].retained, 'alt');
eq('no homozygous warning when het', /HOMOZYGOUS/.test(mu.meta['chr21:1100'].why), false);
vdata[0].gts[0] = GT_HOM;
eq('homozygous IS flagged', /HOMOZYGOUS/.test(asSitesMutation(0,1000,2000,0,'TESTG',null).meta['chr21:1100'].why), true);
vdata[0].gts[0] = GT_HAP1;

console.log('--- indels are admitted by mutation mode ---');
vdata[0].cls[4] = 1;                                  // make the indel a disease variant
const mu2 = asSitesMutation(0, 1000, 2000, 0, 'TESTG', null);
eq('indel kept as a target', mu2.sites.map(s=>s.alt), ['G','AT']);
eq('but phased mode still excludes it as a SITE', asSitesPhased(0,1000,2000,0,'TESTG',null).sites.some(s=>s.pos===1500), false);

console.log(fail ? '\n' + fail + ' FAILED' : '\nall passed');
process.exit(fail ? 1 : 0);
