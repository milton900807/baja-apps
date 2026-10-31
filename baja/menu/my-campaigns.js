function () {

    // THE HEADER MENU'S "My campaigns": what is running, what it has raised, and the
    // donations behind it. The page says so itself if the account may not see it.
    return (async () => {
        try { clear(); } catch (e) { }
        try { window.history.pushState({}, '', '/app/fundraise/admin'); } catch (e) { }
        return await exec('fundraise/admin');
    })();
}
