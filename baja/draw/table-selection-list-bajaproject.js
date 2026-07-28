function (pm, template_path) {

    return new Promise(async (resolve, reject) => {
        const names = [
        ]
        const tree = await exec('baja/table/datayak-budgets-tables.js', pm, template_path)

        console.log('debubg');
        names.push({
            "label": "Close", "click": () => {
                CurrentLayout.reset('mainPanel')
                hideAllModal();
            }, "description": '  '
        });
        try {
            function renderTree(nodeList, panelName = 'mainPanel') {
                if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                let localNodeList = [...nodeList].filter(item => !item.label.endsWith('.'));
                localNodeList.push(
                    {
                        'label': 'Close',
                        click: async () => {
                            CurrentLayout.reset(panelName);
                        }
                    })
                const buildDesc = (items) => {
                    let descl = {}
                    for (let i of items) {
                        if (i.desc) {
                            descl[i.label] = i.desc
                        }
                    }
                    return descl;
                }

                let component = {
                    wid: 'selection-list',
                    data: {
                        single_selection: true,
                        show_button: false,
                        singleSelect: true,
                        contentItems: buildDesc(localNodeList),
                        listItems: localNodeList.map(item => item.label),
                        button_function: createIonFunction(async (items) => {
                            let selectedLabel = items[0];
                            let selectedItem = localNodeList.find(item => {
                                if (item) {
                                    let cleanItem = item.label.endsWith('.') ? item.slice(0, -1) : item.label;
                                    return cleanItem === selectedLabel;
                                } else
                                    return false;
                            });

                            if (selectedItem.click) {
                                selectedItem.click();
                            }

                            CurrentLayout.reset(panelName);

                            if (selectedItem.children && selectedItem.children.length > 0) {
                                renderTree(selectedItem.children, panelName);
                            } else {

                            }
                        })
                    }
                };
                CurrentLayout.clearComponent(panelName);
                CurrentLayout.setComponent(panelName, component);
            }

            setTimeout(async () => {
                renderTree(tree)
            }, 200)
        } catch (exception) { }
        resolve()

    });
}
