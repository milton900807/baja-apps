// THE RATIO SHIFT CARD IN DESIGN > THERAPEUTICS.
//
//     node tools/test/design-menu-ratio-shift.js
//
// The model is reachable by name and from the models shelf; this is the third place, and
// the one where someone designing an oligo is actually standing. A card that opens onto a
// refusal is worse than a card that says what is missing, so the gating and both
// directions are checked here rather than left to be found with two tracks on a canvas.
//
// The card is lifted out of the menu source and run with stubs: the menu itself is three
// thousand lines of editor and its own harness would test the harness.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/manchester/menu/track-design-menu.js', 'utf8');
const from = src.indexOf("title: 'Ratio shift', badge: 'Two transcripts',");
ok(from > 0, 'the card is in the Therapeutics list');
const to = src.indexOf('\n        }, {', from);
const text = src.slice(from, to);

// Everything the card closes over, stubbed. The calls it makes are recorded rather than
// run: what matters is which track goes in as up and which as down.
const calls = [];
const mk = (partners, label, selected) => {
    const exec = (path, a, b, c) => { calls.push({ path: path, a: a, b: b, c: c }); return Promise.resolve({ ok: true }); };
    const f = new Function('__ratioPartners', '__trackLabel', 'selectedTrack', 'graph', 'exec',
        'return ({ ' + text + ' });');
    return f(partners, label, selected, { wake() { } }, exec);
};

const SEQ = 'ACGT'.repeat(50);
const selected = { name: 'DNM1_3utr', sequence: SEQ };
const other = { name: 'DNM3_3utr', sequence: SEQ };

// ---- with a second transcript -----------------------------------------------------------
calls.length = 0;
let card = mk([other], 'DNM1_3utr', selected);
ok(card.ready === true, 'it is offered when there is a second transcript to shift against');
ok(/blockers that push two messages opposite ways/i.test(card.blurb), 'the blurb says what it does');
ok(/Nothing is measured/.test(card.blurb), 'and that it measures nothing');
ok(/3’ UTRs rather than two whole genes/.test(card.blurb), 'and where to run it');

// THE CARD ASKS RATHER THAN GUESSES. It used to list every pairing and both directions as
// its own little shelf: with three transcripts open that is six near-identical entries,
// and the direction, which is the whole choice, was buried in the wording of each.
calls.length = 0;
card.open();
ok(calls.length === 1 && /ratio-shift-picker/.test(calls[0].path), 'the card opens the picker: ' + (calls[0] || {}).path);
ok(calls[0].b && Object.keys(calls[0].b).length === 0,
   'with neither end preset, so both tracks are chosen on purpose rather than one being '
   + 'taken from whichever track this menu was opened on');
ok(typeof card.books !== 'function', 'and it is a leaf, not a shelf of pairings');

// ---- with nothing to pair it with ---------------------------------------------------------
card = mk([], 'DNM1_3utr', selected);
ok(card.ready === false, 'with one transcript it is greyed rather than offered');
ok(/model of a\s+PAIR/.test(card.blurb.replace(/\s+/g, ' ')) || /needs the other one/.test(card.blurb),
   'saying why: ' + card.blurb.slice(0, 80));
ok(card.readyNote === 'needs a second transcript', 'and the badge says what is missing');

// ---- a track with no sequence is not a partner ----------------------------------------------
// The model refuses a track it cannot read, so the menu must not count one: the gate here
// and the refusal there are the same rule, written once in each place and tested here.
const gate = src.slice(src.indexOf('const __ratioPartners'), src.indexOf('const __ratioPartners') + 600);
ok(/length < 40/.test(gate), 'the partner list skips a track with no sequence to scan');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
