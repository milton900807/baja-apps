// MORE THAN ONE SELECTED REGION ON A TRACK.
//
//     node tools/test/multi-region-selection.js
//
// "select exon 15 and exon 16" selected exon 15 and reported the rest as "not something the
// editor can do: selecting multiple non-contiguous regions simultaneously". A selection was
// one range, markstart to markend, and that range is read in six hundred and fifty-odd
// places: every model, every designer, every export. Replacing it with a list would mean
// changing all of them correctly in one go, and the ones that were missed would silently act
// on the wrong stretch of sequence.
//
// So the first region stays exactly where it was and further regions go in marks[]. Nothing
// that knows only about one selection has to change, and it keeps acting on the first
// region, which is a rule someone can hold in their head.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The real methods, lifted from the Track class with their braces counted.
const lift = (names) => {
    const src = fs.readFileSync('baja/bio/track-flexi.js', 'utf8');
    const out = {};
    for (const n of names) {
        // The DEFINITION, not the first mention: these names appear in the comments above
        // them, and lifting from a comment lifts half a sentence.
        const m = new RegExp('\\n\\s{8}' + n + '\\s*\\(').exec(src);
        if (!m) throw new Error('no ' + n + ' definition in track-flexi.js');
        const at = m.index + 1 + (m[0].length - m[0].trimStart().length) - 1;
        let depth = 0, end = -1;
        for (let i = src.indexOf('{', at); i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        // eslint-disable-next-line no-eval
        out[n] = eval('(function ' + src.slice(at, end).trim().slice(n.length) + ')');
    }
    return out;
};
const M = lift(['getSelectedRanges', 'addMark', '__mergeMarks', 'keepOneMark', 'selectedLength', 'hasSelection']);
const mkTrack = () => Object.assign({ markstart: null, markend: null, marks: [] }, M);
const spans = (t) => M.getSelectedRanges.call(t).map((r) => r.start + '-' + r.end).join(', ');

(() => {
    // ---- the first region goes where it always went --------------------------------------
    let t = mkTrack();
    t.addMark(100, 156);
    ok(t.markstart === 100 && t.markend === 156,
       'a first add fills markstart/markend, so every single-range reader sees it: '
       + t.markstart + '-' + t.markend);
    ok(t.marks.length === 0, 'and nothing is hiding in the list where they cannot see it');

    // ---- and the second does not move it ---------------------------------------------------
    t.addMark(300, 362);
    ok(t.markstart === 100 && t.markend === 156,
       'a second add leaves the first exactly where it was: ' + t.markstart + '-' + t.markend);
    ok(t.marks.length === 1 && t.marks[0].start === 300,
       'the new one goes beside it: ' + JSON.stringify(t.marks));
    ok(spans(t) === '100-156, 300-362', 'both are selected: ' + spans(t));
    ok(t.selectedLength() === 56 + 62, 'and the total is both of them: ' + t.selectedLength());

    // Jeff's sentence: exon 15 and exon 16, which do not touch.
    t = mkTrack();
    t.addMark(1000, 1056);      // exon 15
    t.addMark(1200, 1270);      // exon 16
    ok(M.getSelectedRanges.call(t).length === 2, 'exon 15 and exon 16 are both held');
    ok(t.markstart === 1000 && t.markend === 1056,
       'and an operation that takes one region takes the first, which is exon 15');

    // ---- regions that meet are one region ---------------------------------------------------
    t = mkTrack();
    t.addMark(100, 200);
    t.addMark(200, 300);
    ok(spans(t) === '100-300',
       'two regions that touch are merged rather than kept side by side, or the sequence '
       + 'between them would be counted twice: ' + spans(t));
    ok(t.marks.length === 0, 'and the merge happens in the primary, where the readers look');

    t = mkTrack();
    t.addMark(100, 200);
    t.addMark(150, 260);
    ok(spans(t) === '100-260', 'overlapping regions too: ' + spans(t));

    // A region added between two others joins them both.
    t = mkTrack();
    t.addMark(100, 150);
    t.addMark(300, 350);
    t.addMark(140, 310);
    ok(spans(t) === '100-350',
       'and one that bridges two existing regions swallows both: ' + spans(t));

    // Out of order is still correct.
    t = mkTrack();
    t.addMark(500, 600);
    t.addMark(100, 200);
    ok(spans(t) === '500-600, 100-200',
       'the order is the order they were made, because the first is the one a single-range '
       + 'operation uses: ' + spans(t));

    // ---- nonsense is refused rather than stored -----------------------------------------------
    t = mkTrack();
    ok(t.addMark(100, 100) === false, 'an empty region is not a selection');
    ok(t.addMark(NaN, 50) === false, 'and neither is one with no numbers in it');
    ok(M.getSelectedRanges.call(t).length === 0, 'so nothing was selected: ' + spans(t));
    t.addMark(60, 20);
    ok(spans(t) === '20-60', 'a backwards region is read the right way round: ' + spans(t));

    // ---- a plain selection replaces, it does not accumulate -------------------------------------
    t = mkTrack();
    t.addMark(100, 150);
    t.addMark(300, 350);
    t.keepOneMark();
    t.markstart = 700; t.markend = 760;
    ok(spans(t) === '700-760',
       'selecting without add leaves one region, not three: ' + spans(t));

    // ---- the rest of the wiring ------------------------------------------------------------------
    const cap = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    const sel = cap.slice(cap.indexOf("name: 'select_sequence_region'"), cap.indexOf("name: 'clear_sequence_selection'"));
    ok(/add: \{\s*\n\s*type: 'boolean'/.test(sel), 'select_sequence_region takes an add flag');
    // Written across a concatenation in the source, so the phrase is matched as the planner
    // will read it once the strings are joined, not as one literal.
    ok(/exon 15 and exon 16/.test(sel.replace(/'\s*\+\s*'/g, '')),
       'and its description gives the planner the example it got wrong');
    ok(/if \(!adding\) \{[\s\S]{0,400}clearSequenceSelections/.test(sel),
       'a plain selection still clears first, so it replaces as it always did');
    ok(/\} else \{[\s\S]{0,300}t\.addMark\(r\.start, r\.end\)/.test(sel),
       'and an adding one does not clear');
    ok(/An operation that takes one region takes the first/.test(sel),
       'the user is told which region the next step will use, while they can still change it');

    const gene = fs.readFileSync('flexigraph/gene.js', 'utf8');
    ok(/t\.marks = \[\];/.test(gene),
       'clearing the selection clears the extra regions too, or the track would look '
       + 'deselected while every "over the selection" step still ran over them');

    const track = fs.readFileSync('baja/bio/track-flexi.js', 'utf8');
    ok(/EVERY SELECTED REGION gets its letters/.test(track)
       && /for \(const __r of \(this\.marks \|\| \[\]\)\)/.test(track),
       'and every region is drawn: a region that is selected and does not look selected is '
       + 'worse than not being able to select it');
    ok(/deselect\(\) \{[\s\S]{0,200}this\.marks = \[\];/.test(track),
       'deselecting a track drops them as well');

    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/SEVERAL REGIONS IS SEVERAL STEPS/.test(plan),
       'and the planner is told to split a request that names more than one region');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
