function (path, config) {
    // THE VIEWER for a timeline (or chart) shared "view only": /app/cpd/baja-analytics-viewer
    // ?share=<code>. The share link (/s/<code>) lands here when the share is view-only and
    // narrowed to one plot. It is Analytics with everything but the maximized object taken
    // away: no menubar, no navigation bar, no close button, no bookmarks, and nothing on the
    // timeline takes a press; the wheel and a drag still move through time, and the
    // author's changes still arrive live.
    config = (config && typeof config === 'object') ? config : {};
    config.viewer = true;
    return exec('cpd/baja-analytics.js', path, config);
}
