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
    const ALLOW = (Array.isArray(o.allow) ? o.allow.filter((x) => typeof x === 'string') : [])
        // The dialogs core itself puts up (prompt, the info panel), which an operation
        // started FROM a shielded panel opens on top of it.
        .concat(['#baja-prompt-panel', '#baja-info-panel', '#baja-prompt-text']);
    // MOVING THE MOUSE IS A MOUSE EVENT TOO. The first version stopped presses, releases and
    // clicks, which is what "clicks" means to a person and not what a canvas listens to: it
    // hovers, highlights, resizes columns and drags from the MOVE, through a window listener
    // that a panel in front of it does not interrupt. So the canvas under an open panel went
    // on reacting to a pointer that was never meant for it -- buttons lighting up under the
    // box, the cursor changing, a drag following the mouse behind the panel.
    const EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
        'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout', 'click', 'dblclick',
        'contextmenu', 'touchstart', 'touchmove', 'touchend', 'wheel', 'dragover', 'drop'];

    let dead = false;         // the panel is gone; swallow everything for a moment
    let released = false;     // listeners already removed

    // A PANEL THAT OPENED ON TOP OF THIS ONE IS NOT BEHIND IT.
    //
    // A shield blocks what is UNDER the panel, and the canvas is under it. Another dialog --
    // the one an operation opens while its card is still up, asking a question the card
    // cannot -- is above it, and swallowing its clicks leaves the user with an OK button
    // that does nothing. So anything inside a floating layer at least as high as this panel
    // passes through: that is what "on top of" means, and it does not need a list of which
    // dialogs exist.
    const zOf = (node) => {
        try {
            const st = (typeof getComputedStyle === 'function') ? getComputedStyle(node) : null;
            if (!st) return null;
            if (st.position !== 'fixed' && st.position !== 'absolute' && st.position !== 'sticky') return null;
            const z = parseInt(st.zIndex, 10);
            return isFinite(z) ? z : null;
        } catch (e) { return null; }
    };
    let baseZ = null;
    try { baseZ = zOf(el); } catch (e) { baseZ = null; }

    const onTop = (t) => {
        let node = t, hops = 0;
        while (node && node.nodeType === 1 && hops++ < 40) {
            const z = zOf(node);
            if (z != null && (baseZ == null ? z >= 1000 : z >= baseZ)) return true;
            node = node.parentNode;
        }
        return false;
    };

    const inside = (t) => {
        try {
            if (!el || !t) return false;
            if (el === t) return true;
            if (el.contains && el.contains(t)) return true;
            if (ALLOW.length && t.closest) {
                for (const sel of ALLOW) { if (t.closest(sel)) return true; }
            }
            return onTop(t);
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

    // WHAT HAPPENS INSIDE THE PANEL STAYS INSIDE IT. Letting the panel's own events through
    // untouched let them through all the way: a release on the Cancel button reached the
    // panel, then carried on up to the window, where the canvas listens for releases, and
    // the canvas acted on a release at that spot while the box was still on screen. The
    // closing click comes last of all, so everything before it had already got out.
    //
    // Anything that arrives here, at the document on the way back up, was inside the panel
    // (everything else was stopped on the way down, above). The panel and all that is in
    // it have had their turn by now, so it goes no further: the window never hears it.
    //
    // ONE RELEASE IS STILL LET OUT: one with no press in the panel before it. That is the
    // end of the gesture that OPENED the panel, a press on the canvas whose release lands
    // on the panel now in front of it, and the window's mouseup is what ends a drag;
    // swallowing it would strand the canvas mid-drag. Once something in the panel has been
    // pressed, every release after that is the panel's own and is kept.
    const PRESS = { mousedown: 1, pointerdown: 1, touchstart: 1 };
    const RELEASE = { mouseup: 1, pointerup: 1, touchend: 1, pointercancel: 1 };
    let pressedInside = false;
    const contain = (e) => {
        try {
            if (PRESS[e.type]) pressedInside = true;
            else if (RELEASE[e.type] && !pressedInside) return;
            e.stopPropagation();
        } catch (e2) { }
    };

    for (const name of EVENTS) {
        try { document.addEventListener(name, stop, true); } catch (e) { }
        try { document.addEventListener(name, contain, false); } catch (e) { }
    }

    const remove = () => {
        if (released) return;
        released = true;
        for (const name of EVENTS) {
            try { document.removeEventListener(name, stop, true); } catch (e) { }
            try { document.removeEventListener(name, contain, false); } catch (e) { }
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
