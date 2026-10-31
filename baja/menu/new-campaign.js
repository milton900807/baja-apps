function () {

    // THE HEADER MENU'S "Start a campaign": straight to the console, from anywhere in the
    // app. The same place the Funds door leads, one step shorter.
    return (async () => {
        try { clear(); } catch (e) { }
        try { window.history.pushState({}, '', '/app/fundraise/console'); } catch (e) { }
        return await exec('fundraise/console');
    })();
}
