function (who) {

    // WHO MAY OPEN THE FUNDRAISING ADMINISTRATION.
    //
    //   const A = await exec('fundraise/admins.js');
    //   A.list                      the addresses allowed
    //   A.allows('a@b.com')         true/false
    //   await exec('fundraise/admins.js', getUser())   -> true/false, the short way
    //
    // The same list is enforced on the server, where FUNDRAISE_ADMINS (comma-separated) can
    // override it, in front of /fundraise/campaigns and /stripe/donation-report. This copy
    // decides what the browser SHOWS; that one decides what the browser can GET. Changing
    // this file alone changes nothing about who can reach the data, which is the right way
    // round: a check in a page is a courtesy to the person using it, never a lock.
    const LIST = ['jeffmilto@gmail.com'];
    const norm = (v) => ('' + (v == null ? '' : v)).trim().toLowerCase();
    const allows = (v) => { const w = norm(v); return !!w && LIST.indexOf(w) >= 0; };
    if (who !== undefined) return allows(who);
    return { list: LIST.slice(), allows: allows, norm: norm };
}
