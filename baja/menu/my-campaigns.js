function () {

    // THE HEADER MENU'S "My campaigns": the campaigns this account has started, what each
    // has raised, and the donations behind the total. Every account has its own; the page
    // only asks that somebody is signed in.
    return (async () => {
        try { clear(); } catch (e) { }
        try { window.history.pushState({}, '', '/app/fundraise/admin'); } catch (e) { }
        return await exec('fundraise/admin');
    })();
}
