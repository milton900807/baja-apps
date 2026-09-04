function (graph, genegraph_panel_layout, oligos, trackHint) {

    // "Modify Chemistry" -- describe a chemistry change in plain language and have it
    // designed onto compounds, keeping their bases exactly as they are.
    //   exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout)
    //   exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout, oneOligoOrMany)
    //
    // This is now a thin front door onto baja/chem/ui/describe-chemistry-window.js, which
    // does the actual work. It used to mount its own card into mainPanel, and that was the
    // bug behind "the window never comes up": almost every caller here is a menu or a
    // selection shelf, and those tear down when an item is clicked -- restoring the editor
    // canvas into mainPanel and taking this panel with it, sometimes before it had even
    // finished opening. The describe window is a floating overlay appended to document.body
    // instead, outside CurrentLayout's panel system entirely, so nothing a menu does on its
    // way out can land on top of it.
    //
    // `trackHint` is accepted and ignored -- it only ever fed a per-track label on the old
    // picker. Kept in the signature so the existing call sites don't have to change.

    return exec('baja/chem/ui/describe-chemistry-window.js', graph, genegraph_panel_layout, oligos);
}
