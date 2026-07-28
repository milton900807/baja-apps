function (path, filebrowserplease) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!path) path = null;

            const MSGraph = await exec('lib/msgraph.js');

            if (!MSGraph.isLoggedIn()) {

                login();
                return resolve();
            }

            async function isAdmin() {
                try {

                    const user = getUser && getUser();
                    if (!user) return false;

                    return user.endsWith('@lajollalabs.com') || user.endsWith('@hts.bio');
                } catch (e) {
                    console.error('Admin check failed:', e);
                    return false;
                }
            }

            const isAdminUser = await isAdmin();

            if (!isAdminUser) {

                clear();
                showWidget({
                    wid: 'card',
                    data: {
                        height: '400px',
                        width: '600px',
                        cards: [[
                            {
                                width: '100%',
                                component: {
                                    wid: 'html',
                                    data: `
                                        <div style="padding: 24px; text-align: center;">
                                            <h2>System Administration</h2>
                                            <p>You do not have permission to access system administration tools.</p>
                                            <p>Please contact your system administrator.</p>
                                        </div>
                                    `
                                }
                            }
                        ]]
                    }
                });
                return resolve();
            }

            const userEmail = getUser && getUser();
            const apiHost = window['env'] && window['env']['apiUrl'];

            const statusStrip = {
                wid: 'html',
                data: `
                    <div style="
                        width: 100%;
                        padding: 8px 16px;
                        font-size: 12px;
                        color: #333;
                        background: #e8f0ff;
                        border-bottom: 1px solid #c3d0f5;
                    ">
                        Signed in as <b>${userEmail || 'unknown user'}</b> &mdash; System Administrator
                    </div>
                `
            };

            const adminDashboard = {
                wid: 'radio-buttons',
                data: {
                    description: 'System Administration tools',
                    type: 'Applications',
                    unchecked: true,
                    button_size: 260,
                    buttons: [
                        {
                            label: 'User Licenses',
                            description: 'View and manage user subscriptions and app licenses.',
                            svg: await exec('icons/svg/admin', 'Users & Licenses'),
                            ionfunction: createIonFunction(async () => {

                                let editorPanel;
                                let editor = createIonFunction((panel) => {
                                    editorPanel = panel;
                                })

                                let export_sequence = {
                                    wid: 'card',
                                    data: {
                                        height: '800px',
                                        cards: [
                                            [
                                                {
                                                    'title': 'System Logging is on; executing traceback. ',
                                                    'width': '100%',
                                                    'height': '500px',
                                                    'component': {
                                                        wid: 'json',
                                                        height: '600px',
                                                        refCallback: editor,
                                                        data: ''
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Save', ionFunction: createIonFunction(async () => {
                                                                        let v = {
                                                                            id: 'sub_123456789',
                                                                            app: '___',
                                                                        }
                                                                        let host_ = window['env']['apiUrl']
                                                                        v = JSON.parse ( editorPanel.getData () )
                                                                        let rs = await POSTJSON(v, host_ + '/subscription');
                                                                        hideAllModal();
                                                                        clear();
                                                                        showWidget({
                                                                            wid: 'json',
                                                                            data: JSON.stringify(rs)
                                                                        })

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }

                                showModal (export_sequence)

                            })
                        },
                        {
                            label: 'System Status',
                            description: 'View backend health checks and recent errors.',
                            svg: await exec('icons/svg/status', 'System Status'),
                            ionfunction: createIonFunction(async () => {
                                clear();
                                const host_ = window['env']['apiUrl'];
                                let statusJson = null;
                                try {
                                    statusJson = await GETJSON(host_ + '/admin/status');
                                } catch (e) {
                                    statusJson = { error: 'Failed to load /admin/status', detail: String(e) };
                                }

                                showWidget({
                                    wid: 'card',
                                    data: {
                                        height: '800px',
                                        width: '100%',
                                        cards: [[
                                            {
                                                width: '100%',
                                                component: {
                                                    wid: 'html',
                                                    data: '<h2 style="padding: 8px 16px;">System Status</h2><hr>'
                                                }
                                            },
                                            {
                                                width: '100%',
                                                component: {
                                                    wid: 'html',
                                                    data: `<pre style="padding: 16px; font-size: 12px;">${JSON.stringify(statusJson, null, 2)}</pre>`
                                                }
                                            },
                                            {
                                                width: '100%',
                                                component: {
                                                    wid: 'mt-button',
                                                    data: {
                                                        useStyledButtons: true,
                                                        buttons: [
                                                            {
                                                                label: 'Back to Admin Menu',
                                                                ionFunction: createIonFunction(() => {
                                                                    clear();
                                                                    showWidget(adminMainLayout);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                    }
                                });
                            })
                        },
                        {
                            label: 'Logs',
                            description: 'Inspect system logs and recent events.',
                            svg: await exec('icons/svg/logs', 'Logs'),
                            ionfunction: createIonFunction(async () => {
                                clear();
                                const host_ = window['env']['apiUrl'];
                                let logs = null;
                                try {
                                    logs = await GETJSON(host_ + '/admin/logs?limit=200');
                                } catch (e) {
                                    logs = { error: 'Failed to load /admin/logs', detail: String(e) };
                                }

                                showWidget({
                                    wid: 'card',
                                    data: {
                                        height: '800px',
                                        width: '100%',
                                        cards: [[
                                            {
                                                width: '100%',
                                                component: {
                                                    wid: 'html',
                                                    data: '<h2 style="padding: 8px 16px;">System Logs</h2><hr>'
                                                }
                                            },
                                            {
                                                width: '100%',
                                                component: {
                                                    wid: 'html',
                                                    data: `<pre style="padding: 16px; font-size: 12px;">${JSON.stringify(logs, null, 2)}</pre>`
                                                }
                                            },
                                            {
                                                width: '100%',
                                                component: {
                                                    wid: 'mt-button',
                                                    data: {
                                                        useStyledButtons: true,
                                                        buttons: [
                                                            {
                                                                label: 'Back to Admin Menu',
                                                                ionFunction: createIonFunction(() => {
                                                                    clear();
                                                                    showWidget(adminMainLayout);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                    }
                                });
                            })
                        },
                        {
                            label: 'Back to Apps',
                            description: 'Return to the standard application launcher.',
                            svg: await exec('icons/svg/home', 'Back'),
                            ionfunction: createIonFunction(async () => {
                                clear();

                                await exec('baja/yak', path, filebrowserplease);
                            })
                        }
                    ]
                }
            };

            const adminMainLayout = {
                wid: 'card',
                height: '100%',
                width: '100%',
                data: {
                    cards: [[
                        {
                            width: '100%',
                            component: statusStrip
                        },
                        {
                            width: '100%',
                            component: {
                                wid: 'card',
                                data: {
                                    height: '800px',
                                    width: '100%',
                                    cards: [[
                                        {
                                            width: '100%',
                                            component: {
                                                wid: 'html',
                                                data: `
                                                    <div style="padding: 16px;">
                                                        <h1>System Administration</h1>
                                                        <p>Manage users, licenses, and system health.</p>
                                                        <hr>
                                                    </div>
                                                `
                                            }
                                        },
                                        {
                                            width: '100%',
                                            component: adminDashboard
                                        }
                                    ]]
                                }
                            }
                        }
                    ]]
                }
            };

            clear();
            showWidget(adminMainLayout);

            return resolve();
        } catch (err) {
            console.error('Error in System Administration launcher:', err);
            reject(err);
        }
    });
}
