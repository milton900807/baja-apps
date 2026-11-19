// THE FLY IS A SPECIES THE BACKEND KNOWS.
//
//     node tools/test/species-fly.js
//
// Drosophila was in none of the backend's species tables, so "drosophila" was not a species
// that had no data: it was not a species at all. A gene lookup answered "not a species this
// holds chromosomes for", which reads as the fly not being supported rather than as an
// annotation nobody has loaded yet.
//
// There are six of these tables and they have drifted before -- two of them carry comments
// telling the next person to keep them in step. A species added to one and missed in another
// resolves for a lookup and vanishes for an off-target screen, which looks like a bug in the
// screen rather than a missing name.
const fs = require('fs');
const { execFileSync } = require('child_process');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const read = (p) => fs.readFileSync(p, 'utf8');

// Each table, and the shape a species key takes in it.
const TABLES = [
    ['py/bio/karyotype.py', 'chromosomes', /"fly":\s*\[/],
    ['py/bio/gene-locus.py', 'the gene lookup', /"fly":\s*\[/],
    ['py/bio/gene-locus.py', 'the annotation it reads', /"fly":\s*"reference_data\//],
    ['py/bio/build-karyotype.py', 'the karyotype builder', /\("fly",\s*"dm6"\)/],
    ['py/sequence/prompt-to-transcript.py', 'transcript lookup', /"fly":\s*\[/],
    ['py/sequence/offtarget/uniqueness-gradient.py', 'off-target indexes', /"fly":\s*\[/],
    ['py/sequence/extract-entities.py', 'Ensembl entity extraction', /"fly":\s*"drosophila_melanogaster"/],
    ['py/sequence/extract-entities-file.py', 'Ensembl extraction from a file', /"fly":\s*"drosophila_melanogaster"/],
    ['py/bio/genome-sequence.py', 'the genome FASTA', /"fly":\s*"data\/genome\//]
];

(() => {
    for (const [file, what, re] of TABLES) {
        ok(re.test(read(file)), 'the fly is in ' + what + ' (' + file.split('/').pop() + ')');
    }

    // ---- one key, spelled the same everywhere ---------------------------------------------
    // "fly" and not "drosophila" as the key: the tables are keyed by the word people type,
    // and every other key here is the common name.
    for (const [file] of TABLES) {
        const s = read(file);
        ok(!/"drosophila(_melanogaster)?":\s*\[/.test(s) || /uniqueness-gradient/.test(file),
           'no second key for the same species in ' + file.split('/').pop());
    }

    // ---- the words someone would actually type -------------------------------------------
    const kary = read('py/bio/karyotype.py');
    for (const w of ['drosophila', 'drosophila melanogaster', 'd melanogaster', 'dmel',
        'fruit fly', 'melanogaster', 'dm6', 'flybase']) {
        ok(kary.indexOf('"' + w + '"') >= 0, 'it answers to "' + w + '"');
    }

    // ---- the chromosome filter admits the fly's arms ---------------------------------------
    // 2L, 2R, 3L, 3R, 4, X, Y. A filter that only knows chr1..chrN drops every autosome the
    // fly has, and the karyotype builds empty.
    // The real line is pulled out of the file and compiled, so this tests the pattern that
    // ships rather than a copy of it that can drift.
    const probe = [
        'import re',
        'src = open("py/bio/build-karyotype.py").read()',
        'line = [l for l in src.split(chr(10)) if l.startswith("PRIMARY = ")][0]',
        'PRIMARY = eval(line.split("=", 1)[1].strip())',
        'names = ["chr2L","chr2R","chr3L","chr3R","chr4","chrX","chrY","chr1","chr22","chrM","chrIV","chr2L_random","chrUn_CP007120v1"]',
        'print(",".join(n for n in names if PRIMARY.match(n)))'
    ].join('\n');
    const kept = execFileSync('python3', ['-c', probe], { cwd: process.cwd(), encoding: 'utf8' }).trim().split(',');
    for (const n of ['chr2L', 'chr2R', 'chr3L', 'chr3R', 'chr4', 'chrX', 'chrY']) {
        ok(kept.indexOf(n) >= 0, n + ' is kept, so the fly karyotype is not built empty');
    }
    for (const n of ['chr1', 'chr22', 'chrM', 'chrIV']) {
        ok(kept.indexOf(n) >= 0, n + ' still is, so no other species lost a chromosome');
    }
    for (const n of ['chr2L_random', 'chrUn_CP007120v1']) {
        ok(kept.indexOf(n) < 0, n + ' is still excluded: a scaffold is not a chromosome');
    }

    // ---- FlyBase transcript ids ------------------------------------------------------------
    // The fly keeps FBtr ids rather than ENS* ones. A fly transcript the matcher does not
    // recognise is one that silently never resolves.
    const pt = read('py/sequence/prompt-to-transcript.py');
    ok(/FBtr\\d\{7,\}/.test(pt), 'FlyBase transcript ids are recognised');
    ok(/FLYBASE_TRANSCRIPT_RE\.match\(t\)/.test(pt), 'and the matcher actually consults them');

    // ---- the messages do not name a stale list ----------------------------------------------
    // Both of these used to write the species out by hand, so adding one left the sentence
    // telling the user to try a set that no longer matched the table.
    ok(/", "\.join\(sorted\(SYNONYMS\)\)/.test(kary),
       'the "not a species" message lists the table rather than a hand-written set');
    ok(/", "\.join\(sorted\(GENOME\)\)/.test(read('py/bio/genome-sequence.py')),
       'and so does the "no genome for" message');

    // ---- what is NOT claimed -----------------------------------------------------------------
    // Naming a species does not create its data. These two report what is missing, which is
    // the behaviour that makes adding the name safe before the files arrive.
    ok(/the %s karyotype is not on this server/.test(kary),
       'a species with no karyotype built says exactly that, and how to build it');
    ok(/the %s annotation is not on this server/.test(read('py/bio/gene-locus.py')),
       'and a species with no annotation says that rather than returning nothing');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
