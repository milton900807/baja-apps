return (path) => {

    // A script path as a NAME, for anywhere one is shown to a person.
    //   const name = await exec('baja/lib/script-name.js');
    //   name('py/ssaso/design.py')   ->  'py_ssaso_design'
    //
    // Reports get exported, pasted into slide decks and sent to collaborators, and the source
    // layout of the app is not part of what they are meant to say. Slashes become underscores
    // and the extension goes, which leaves something still identifiable -- two runs of the
    // same designer read the same -- without reading as a file on somebody's disk.
    //
    // One helper rather than the same three replaces written wherever a path is displayed,
    // because the whole value of the convention is that every surface applies it identically.
    //
    // DISPLAY ONLY. The real path is still what exec() runs and what /py-cancel matches a
    // running job on (see __showSpinner in track-design-menu.js), so nothing here may be fed
    // back into either.
    return ('' + (path == null ? '' : path))
        .replace(/^\/+/, '')                 // a leading slash would become a leading underscore
        .replace(/\.[A-Za-z0-9]+$/, '')      // .py, .js — the extension says nothing useful here
        .replace(/[\/\\]+/g, '_');
};
