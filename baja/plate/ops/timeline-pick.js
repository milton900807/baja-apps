function (pt, wanted) {

    // WHICH TIMELINE A REQUEST IS ABOUT, WORKED OUT ONCE.
    //
    // Two operations need this and a third is coming, and the first version of it was
    // written inside timeline-add.js -- where it also looked in the wrong collection for a
    // year before anyone noticed. One copy, so a fix lands everywhere.
    //
    // The order is: the name that came with the request; then the timeline whose own Ask
    // button was pressed; then the selection; then the only one on the canvas. A canvas with
    // several and nothing to go on is a question, not a guess.

    const name = ('' + (wanted == null ? '' : wanted)).trim();

    if (!pt || typeof pt.__tlIs !== 'function') {
        return { error: 'timelines are not available here' };
    }

    // Timelines are PLOTS: they live in m_plots, not in root, which holds the tables. Every
    // collection the track keeps is read, because which one an object is in has changed
    // before and the cost of reading them all is nothing.
    const all = [];
    for (const list of [pt.m_plots, pt.plots, pt.root, pt.objects]) {
        if (!Array.isArray(list)) continue;
        for (const x of list) { if (pt.__tlIs(x) && all.indexOf(x) < 0) all.push(x); }
    }
    const names = () => all.map((x) => '"' + ((x && x.name) || '?') + '"').join(', ');

    if (name) {
        const hits = all.filter((a) => ('' + ((a && a.name) || '')).trim().toLowerCase() === name.toLowerCase());
        if (hits.length === 1) return { timeline: hits[0], all: all };
        if (hits.length > 1) {
            // Two of the same name: the one whose button was pressed wins.
            const asked = pt.__askedTimeline;
            return { timeline: (asked && hits.indexOf(asked) >= 0) ? asked : hits[0], all: all };
        }
        if (all.length) {
            return { error: 'there is no timeline called "' + name + '" here: this canvas has ' + names() };
        }
    }

    if (pt.__askedTimeline && all.indexOf(pt.__askedTimeline) >= 0) {
        return { timeline: pt.__askedTimeline, all: all };
    }
    if (pt.selectedPlate && pt.__tlIs(pt.selectedPlate)) return { timeline: pt.selectedPlate, all: all };
    if (all.length === 1) return { timeline: all[0], all: all };
    if (all.length > 1) {
        return { error: 'there is more than one timeline here (' + names()
            + '): say which one, or ask from its own Ask button' };
    }
    return { error: 'there is no timeline here' };
}
