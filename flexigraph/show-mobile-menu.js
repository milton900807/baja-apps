function (x, y, list, graph, genegraph_panel_layout, reset) {

    let names = []
    for (let l of list) {
        names.push(l.label)
    }
    let t = {
        wid: 'selection-list',
        data: {
            single_selection: true,
            show_button: false,
            singleSelect: true,
            listItems: names,
            button_function: createIonFunction(async (items) => {

                let name = items[0]
                for (let l of list) {
                    if (l.label === name) {
                        const lbl = '' + (l.label || '');
                        // A submenu / "back" item re-opens another menu list; a leaf item runs an
                        // action. After a LEAF action, close this selection window and return to the
                        // canvas — the mobile menu replaces mainPanel, so it otherwise lingers even
                        // though the user is done (their own showSideMenu(null) doesn't restore it).
                        const opensSubmenu = /[▸►‹◄▶◀]/.test(lbl);
                        try { await Promise.resolve(l.click(x, y)); } catch (e) { }
                        if (reset) {
                            try { CurrentLayout.reset('mainPanel'); } catch (e) { }
                        } else if (!opensSubmenu) {
                            try { CurrentLayout.clearComponent('mainPanel'); CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
                        }
                        break;
                    }
                }
            })
        }
    }

    let design_params_panel_layout = {
        wid: 'card',
        data: {
            cards: [
                [
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: '<hr> '
                        }
                    },
                    {
                        'width': '100%',
                        'component': t
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Close', ionFunction: createIonFunction(() => {
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                        })
                                    }
                                ]
                            }
                        }
                    }

                ]
            ]
        }
    }
    CurrentLayout.clearComponent('mainPanel')
    CurrentLayout.setComponent('mainPanel', design_params_panel_layout);
}
