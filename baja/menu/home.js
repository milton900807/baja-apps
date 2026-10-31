function () {

    // THE HEADER MENU'S "Home".
    //
    // The menu in the toolbar is built from window.env.menu in /eln/assets/env.js, and each
    // entry is a label and a module path: the shell calls exec(path) and nothing else. It
    // does not clear the screen and it does not touch the address bar, so anything the menu
    // opens has to do both for itself. That is all these three modules are -- one line of
    // intent each, so the menu can stay a list of paths.
    return (async () => {
        try { clear(); } catch (e) { }
        try { window.history.pushState({}, '', '/app/baja/init'); } catch (e) { }
        return await exec('baja/home.js');
    })();
}
