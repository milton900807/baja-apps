function (text) {

    // Context-specific "work in progress" status.
    //   exec('baja/lib/work-status.js', 'BajaCLIP · TARDBP sites → UNC13A (whole track)')
    //   exec('baja/lib/work-status.js', null)      // clear
    //
    // Drives the spinner + status line in the app shell (io-engine.ts). That indicator shows
    // ONLY while a status is set, which is the whole point: a generic "Working…" badge tells
    // the user nothing they cannot already see, so it stays hidden, and a specific one --
    // which model, on which track, over what range, going where -- is worth the space.
    //
    // Say WHAT is running and WHERE its output lands. "Running model" is not a status;
    // "BajaSplice · donor/acceptor scores → TARDBP (1,204 nt selection)" is.
    //
    // Clearing is the caller's job, in a finally: the shell drops the status on its own only
    // when the last .py exec of a batch finishes, and non-python work (loading a track,
    // laying out a design) never goes through that path.

    try {
        window.__workStatus = (text == null) ? '' : ('' + text);
        // Show it now rather than on the next poll -- work that starts and finishes inside one
        // poll interval would otherwise never appear at all.
        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
    } catch (e) { }
    return true;
}
