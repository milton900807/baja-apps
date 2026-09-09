function (graph, genegraph_panel_layout) {

    // Annotate and draw on the canvas — the toolbar button's library.
    //   exec('baja/manchester/menu/draw-tools-library.js', graph, genegraph_panel_layout)
    //
    // One shelf with sections rather than nested sub-libraries: there are a dozen tools and
    // they are all one click deep, so making the user walk into "Shapes" to find the
    // rectangle would add a level that carries no decision.
    //
    // NOTHING HERE TOUCHES mainPanel. The shelf is an overlay and each tool arms the canvas
    // that is already mounted, so there is no clear + setComponent on the way in or out.
    // That pairing mounts only the panel object a module was handed rather than the layout
    // the editor stashed, and the canvas does not come back -- the failure that made the
    // ClinVar library items look like they did nothing (see baja/data/load-variants.js and
    // baja/bio/rbp/rbp-profile.js). A drawing tool with no canvas would be exactly as silent.
    return (async () => {

        // Re-arm the hover highlight when the shelf is dismissed WITHOUT choosing a tool.
        // A tool that was chosen arms its own listeners, and re-arming hover over the top of
        // it would fight the tool for the mouse.
        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // Every tool is one-shot: it arms the canvas, you draw one thing, and it hands the
        // mouse back to navigate. The shelf closes itself before open() runs.
        const tool = (path, extra) => () => (extra
            ? exec(path, graph, genegraph_panel_layout)
            : exec(path, graph));

        const books = [
            {
                section: 'Shapes', title: 'Rectangle', badge: 'Drag',
                blurb: 'A plain box. Click and drag to size it, then add a comment.',
                open: tool('baja/manchester/menu/draw-rect-action.js')
            },
            {
                section: 'Shapes', title: 'Oval', badge: 'Drag',
                blurb: 'An ellipse, sized the same way. Useful for circling a region without '
                    + 'implying an exact boundary.',
                open: tool('baja/manchester/menu/draw-oval-action.js')
            },
            {
                section: 'Shapes', title: 'Arrow', badge: 'Drag',
                blurb: 'A straight line with a head, for pointing at something. Drawn in any '
                    + 'direction and squared up when it is saved.',
                open: tool('baja/manchester/menu/draw-line-action.js')
            },
            {
                section: 'Shapes', title: 'Highlight region', badge: 'Drag',
                blurb: 'A dashed outline over a span, for marking an area of interest rather '
                    + 'than drawing an object on top of it.',
                open: tool('baja/manchester/menu/draw-highlight-action.js')
            },

            {
                section: 'Notes and labels', title: 'Text label', badge: 'Drag',
                blurb: 'A boxed label to name a feature or a region.',
                open: tool('baja/manchester/menu/draw-label-action.js')
            },
            {
                section: 'Notes and labels', title: 'Note', badge: 'Drag',
                blurb: 'A sticky note for longer prose that does not belong in a label.',
                open: tool('baja/manchester/menu/draw-note-action.js')
            },
            {
                section: 'Notes and labels', title: 'Text box', badge: 'Drag',
                blurb: 'Free text on the canvas, without the note styling.',
                open: tool('baja/manchester/menu/text-box-action.js')
            },
            {
                section: 'Notes and labels', title: 'Citation', badge: 'Drag',
                blurb: 'A reference box. Paste a PubMed URL into the comment and it is kept '
                    + 'with the drawing.',
                open: tool('baja/manchester/menu/draw-citation-action.js')
            },
            {
                section: 'Notes and labels', title: 'Folder', badge: 'Drag',
                blurb: 'A folder shape for grouping things visually on the board.',
                open: tool('baja/manchester/menu/draw-folder.js')
            },

            {
                section: 'Sequence', title: 'Annotate by description', badge: 'Describe',
                blurb: 'Say what to mark in words and it is resolved to a position on the track '
                    + 'and annotated there.',
                open: () => exec('baja/data/prompt-action.js', window['env']['apiUrl'], graph,
                    genegraph_panel_layout, 'annotate')
            },
            {
                section: 'Sequence', title: 'Select a sequence', badge: 'Select',
                subtitle: 'How do you want to select?',
                blurb: 'Mark a stretch of sequence, then annotate it. Both selection styles are '
                    + 'inside — drag along a track, or drag a box across several.',
                books: () => [
                    {
                        title: 'Click and drag on a track', badge: 'Drag',
                        blurb: 'Drag along one track to mark a span. The annotation tools for the '
                            + 'selection open when the mouse is released.',
                        open: () => exec('baja/manchester/menu/select-sequence.js', graph,
                            genegraph_panel_layout, true)
                    },
                    {
                        title: 'Box drag', badge: 'Drag',
                        blurb: 'Drag a rectangle to take the same span across every track it '
                            + 'crosses, rather than one track at a time.',
                        open: () => exec('baja/manchester/menu/select-box-sequence.js', graph,
                            genegraph_panel_layout)
                    }
                ]
            },
            {
                section: 'Sequence', title: 'Sequence tools', badge: 'Tools',
                blurb: 'The sequence-level tools for the track: read, translate and work on the '
                    + 'bases themselves.',
                open: () => exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout)
            },
            {
                section: 'Sequence', title: 'Protein sequence', badge: 'Tools',
                blurb: 'The protein-level view and its annotation tools, for a track with a '
                    + 'coding sequence.',
                open: () => exec('baja/manchester/menu/protein-annotation-tools.js', graph, genegraph_panel_layout)
            },

            {
                section: 'Annotations', title: 'Annotation tools', badge: 'Edit',
                blurb: 'Create and edit the annotations on the track — exons, regions and the '
                    + 'features drawn from them.',
                open: () => exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout)
            },
            {
                section: 'Annotations', title: 'Show or hide annotations', badge: 'View',
                blurb: 'Choose which classes of annotation are drawn, without deleting any of them.',
                open: () => exec('baja/manchester/menu/annotation/show-annotations-menu.js', graph)
            },
            {
                section: 'Annotations', title: 'Describe a variant', badge: 'Variant',
                blurb: 'Type a change in words — K27M, p.Arg175His, c.83A>T — and it is resolved to '
                    + 'a type and a genomic position and placed on every track it can live on.',
                open: () => exec('baja/data/prompt-variant.js', window['env']['apiUrl'], graph, genegraph_panel_layout)
            },

            {
                section: 'From the track', title: 'Protein domains', badge: 'Annotate',
                blurb: 'Draw the annotated protein domains of a track onto it, rather than '
                    + 'drawing a shape by hand.',
                open: tool('baja/manchester/menu/protein-domains.js', true)
            },
            {
                section: 'From the track', title: 'Extract from text', badge: 'Annotate',
                blurb: 'Read positions out of pasted prose and place them as annotations.',
                open: tool('baja/manchester/menu/text-extract.js', true)
            },

            {
                section: 'Edit', title: 'Edit an object', badge: 'Edit',
                blurb: 'Change a drawing already on the canvas — its text, its comment or its '
                    + 'appearance.',
                open: tool('baja/manchester/menu/edit-drawing.js', true)
            },
            {
                section: 'Edit', title: 'Clear all drawings', badge: 'Destructive',
                blurb: 'Remove every drawn annotation from the canvas. Tracks and their layers '
                    + 'are not touched.',
                open: tool('baja/manchester/menu/clear-drawings.js')
            }
        ];

        try {
            await exec('baja/lib/shelf.js', {
                id: 'baja-draw-tools-library',
                title: 'Annotate and draw',
                subtitle: 'Pick a tool, then click and drag on the canvas. Each tool draws one '
                    + 'thing and hands the mouse back.',
                books: books,
                graph: graph,
                onClose: (reason) => { if (reason !== 'open') restoreHover(); }
            });
        } catch (e) {
            // The shelf is the interface, not the feature: if it cannot open, say so rather
            // than leaving a toolbar button that does nothing.
            try { graph.setMessage(' Could not open the drawing tools: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
