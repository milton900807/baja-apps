function (el, opts) {

    // NOTHING PRESSED ON A PANEL REACHES THE CANVAS UNDER IT.
    //
    // The canvas takes its presses from the canvas element and its releases from the window
    // (canvas.component.ts: a 'mousedown' listener on the element, a window:mouseup host
    // listener). A panel floating over it is a DOM element, so the PRESS lands on the panel
    // -- but the release, the click and every move still travel to the window, and the drag
    // and selection machinery hears them. Pressing a button on the panel moved the canvas
    // under it; closing the panel left the canvas believing a click had just happened there.
    //
    // This stands at the document in the CAPTURE phase, which runs before the canvas element
    // and before any bubble listener on the window, and stops everything that did not happen
    // inside the panel. Events inside the panel are not touched at all: the panel's own
    // buttons and text fields behave exactly as they would without this, which is why the
    // check is "is it in the panel" and never a list of what to allow.
    //
    // AND IT OUTLASTS THE PANEL. A press that closes something is followed by a release and
    // a click after the element is gone, and those landed on the canvas as a fresh click on
    // whatever was underneath. The shield stays up for a moment after release, so the tail
    // of the gesture that dismissed the panel is swallowed with it.

    const o = opts || {};
    const AFTER = (typeof o.after === 'number') ? o.after : 350;   // ms held after release
    // A panel's own pieces do not always live inside it: a type-ahead list, a native select's
    // dropdown and a menu overlay are all appended to the body. Anything matching one of
    // these selectors counts as part of the panel.
    const ALLOW = Array.isArray(o.allow) ? o.allow.filter((x) => typeof x === 'string') : [];
    const EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick',
        'contextmenu', 'touchstart', 'touchend', 'wheel'];

    let dead = false;         // the panel is gone; swallow everything for a moment
    let released = false;     // listeners already removed

    const inside = (t) => {
        try {
            if (!el || !t) return false;
            if (el === t) return true;
            if (el.contains && el.contains(t)) return true;
            if (ALLOW.length && t.closest) {
                for (const sel of ALLOW) { if (t.closest(sel)) return true; }
            }
            return false;
        } catch (e) { return false; }
    };

    const stop = (e) => {
        try {
            if (!dead && inside(e.target)) return;     // the panel's own business
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            // A press is cancelled outright; a release is only kept from travelling. Calling
            // preventDefault on mouseup and click as well suppresses focus and selection
            // behaviour the panel may still want on the way out.
            if (e.type === 'mousedown' || e.type === 'pointerdown'
                || e.type === 'touchstart' || e.type === 'wheel' || e.type === 'contextmenu') {
                if (e.cancelable) e.preventDefault();
            }
        } catch (e2) { }
    };

    for (const name of EVENTS) {
        try { document.addEventListener(name, stop, true); } catch (e) { }
    }

    const remove = () => {
        if (released) return;
        released = true;
        for (const name of EVENTS) {
            try { document.removeEventListener(name, stop, true); } catch (e) { }
        }
    };

    // release(): the panel has gone. Everything is swallowed from here until the tail of the
    // closing gesture has passed, then the shield comes down. Called twice, it does nothing
    // the second time.
    return {
        release: () => {
            if (dead) return;
            dead = true;
            try { setTimeout(remove, AFTER); } catch (e) { remove(); }
        },
        // For a caller that wants it gone this instant (a test, or a panel handing over to
        // another panel that puts up its own).
        removeNow: remove
    };
}
