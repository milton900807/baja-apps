function () {

    return new Promise(async (resolve, reject) => {

        let sequenceTextEditor;
        let descHook = createIonFunction((p) => {
            sequenceTextEditor = p;
        });
        let htmlPanel;
        let htmlblock = createIonFunction((p) => {
            htmlPanel = p;
        });
        let oep = window["env"]["offtarget"];
        if (!oep || oep.length <= 0) {
            oep = '/levenshtein'
        }
        let url = `${oep}/genomes`
        let response = await GETJSON(url)
        let available_genomes = response;

        let selected_genome = '';
        let bg = []
        for (let a of Object.keys(available_genomes)) {
            if (bg.length === 0) {
                selected_genome = a;
            }
            bg.push({
                'label': a, ionfunction: createIonFunction((_label) => {
                    selected_genome = a

                })

            })
        }
        sleep = async (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        let ms = {
            wid: 'radio-buttons',
            height: '100px',
            width: '50px',
            data: { 'buttons': bg }
        }
        let off_target_tool = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: 'Available genomes'
                            }
                        },
                        {
                            'title': ' ', 'body': ` `,
                            'width': '100%',
                            'component': ms

                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: '<hr>Edit distance (number of insertions, deletions or mismatches allowed).'
                            }
                        },

                        {
                            'title': '', 'body': ` `,
                            'width': '50%',
                            'component':
                            {
                                wid: 'radio-buttons',
                                data: {
                                    'unchecked': true,
                                    'buttons': [
                                        {
                                            'label': '0', ionfunction: createIon(() => {
                                                editDistance = 0;
                                            }
                                            )
                                        }, {
                                            'label': '1', ionfunction: createIon(() => {
                                                editDistance = 1;
                                            }
                                            ),
                                        }

                                    ],
                                }
                            }
                        },

                    ]
                ]
            }

        }

        function jsonToTables(data) {
            const oligoQueries = data.oligoQuery;
            let tables = "";
            oligoQueries.forEach(query => {
                tables += query.synthesisSequence + "\n";
                if (query.offtarget && query.offtarget.length > 0) {
                    tables += "chr\tstart\tend\tstrand\n";
                    query.offtarget.forEach(offtarget => {
                        tables += `${offtarget.chr}\t${offtarget.start}\t${offtarget.end}\t${offtarget.strand}\n`;
                    });
                }
                tables += "\n";
            });

            return tables;
        }

        function generateHTMLTable(results) {

            const rows = {};

            results.oligoQuery.forEach(oligo => {
                const [i, j] = oligo.id.split('_').map(Number);

                if (!rows[i]) {
                    rows[i] = {};
                }

                let block = `<td><div><strong>ID: ${oligo.id}</strong><br> ${oligo.synthesisSequence}<br>`;
                block += `<table border="1"><tr><th>Chr</th><th>Start</th><th>End</th><th>Strand</th><th>Edit Distance</th></tr>`;

                oligo.offtarget.forEach(off => {
                    block += `<tr><td>${off.chr}</td><td>${off.start}</td><td>${off.end}</td><td>${off.strand}</td><td>${off.editdistance}</td></tr>`;
                });

                block += `</table></div></td>`;

                if (!rows[i][j]) {
                    rows[i][j] = block;
                } else {
                    rows[i][j] += block;
                }
            });

            let htmlOutput = `<table border="0"><tbody>`;

            Object.keys(rows).sort((a, b) => a - b).forEach(i => {
                htmlOutput += `<tr>`;
                const maxColumns = Math.max(...Object.keys(rows[i]).map(key => parseInt(key)));
                for (let j = 0; j <= maxColumns; j++) {
                    if (rows[i][j]) {
                        htmlOutput += rows[i][j];
                    } else {
                        htmlOutput += `<td></td>`;
                    }
                }
                htmlOutput += `</tr>`;
            });

            htmlOutput += `</tbody></table>`;

            return htmlOutput;
        }

        function parseCommands(text) {
            const lines = text.split('\n');
            const commands = lines.map(line => {
                const [command, ...args] = line.trim().split(' ');
                return {
                    command,
                    args: args.join(' ')
                };
            });
            return commands;
        }

        let sequence_input = {
            wid: 'card',
            data: {
                "style.padding-top": '1px',
                "style.border": '1px',
                "style.height": "500px",
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: ' Enter sequences (max 1000)'
                            }
                        },
                        {
                            'component': {
                                wid: 'text-editor',
                                refCallback: descHook,
                                data: {
                                    width: "500px",
                                    height: "350px",
                                    showButton: false,
                                    editorOptions: { language: 'text', automaticLayout: true },
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                        })
                                    },
                                }
                            }
                        },
                        {
                            'width': '100%',
                            'component': off_target_tool
                        },
                        {
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Search', ionFunction: createIonFunction(async () => {
                                                let value = sequenceTextEditor.code
                                                htmlPanel.setHTML(`<font color='red'> Searching... </font> `);

                                                let sequences = []
                                                let index = 0;
                                                let s = value.split('\n')

                                                function has3columns(inputString) {
                                                    const columns = inputString.split(/[^ACTG]+/i);
                                                    const validColumns = columns.filter(column => column.length > 10 && column.length < 45 && /^[ACTG]+$/i.test(column));
                                                    return validColumns.length >= 2;
                                                }

                                                function isDNAString(dna) {
                                                    const regex = /^[ACTG]+$/i;
                                                    return regex.test(dna);
                                                }
                                                function hasDuplicates(arr) {
                                                    return arr.some((item, index) => arr.indexOf(item) !== index);
                                                }
                                                function getUniqueStrings(arr) {
                                                    const uniqueSet = new Set(arr);
                                                    return Array.from(uniqueSet);
                                                }

                                                let temp = []
                                                for (let ss of s) {
                                                    ss = ss.trim()
                                                    ss = ss.replace(/X/gi, '')
                                                    if (ss && ss.length > 10)
                                                        temp.push(ss)
                                                }

                                                if (hasDuplicates(temp)) {
                                                    infoPrompt(" Duplicate strings are automatically removed. ")
                                                    s = getUniqueStrings(temp)
                                                    let str = ''
                                                    for (let tt of s) {
                                                        str += tt + '\n'
                                                    }
                                                    sequenceTextEditor.setData(str);
                                                }

                                                let t = []
                                                let pp = []
                                                for (let ss of s) {
                                                    ss = ss.trim()
                                                    if (has3columns(ss)) {
                                                        pp.push(ss)
                                                    } else
                                                        if (ss && ss.length > 10 && ss.length < 32 && isDNAString(ss.trim())) {
                                                            t.push(ss.trim());
                                                        }
                                                }

                                                for (let ss of s) {
                                                    if (ss != null && ss.length < 32 && ss.length > 10) {
                                                        let idvalue =  index + '_0';

                                                        sequences.push(
                                                            {
                                                                "id": idvalue,
                                                                "synthesisSequence": ss.trim()
                                                            }
                                                        )
                                                        index++;
                                                    }
                                                }
                                                let cindex = 0;
                                                for (let ss of pp) {
                                                    const columns = ss.split(/[\s,]+/);
                                                    index = 0;
                                                    for (let c of columns) {
                                                        c = c.trim();

                                                        if (c != null && c.length < 32 && c.length > 10) {
                                                            let idvalue = (cindex) + '_' + index;
                                                            index++;
                                                            c = c.replace(/X/gi, '')
                                                            sequences.push(
                                                                {
                                                                    "id": idvalue,
                                                                    "synthesisSequence": c.trim()
                                                                }
                                                            )
                                                        }
                                                    }
                                                    cindex++;
                                                }
                                                if (sequences.length === 0) {
                                                    infoPrompt("The input doesn't contain a valid sequence query.")
                                                    return;
                                                }
                                                let obj = {
                                                    "editDistance": 1,
                                                    "strand": "+-",
                                                    "genomes": [selected_genome],
                                                    "sequences": sequences,
                                                    "runMode": 'editdistance'
                                                }
                                                let oep = window["env"]["offtarget"];
                                                if (!oep || oep.length <= 0) {
                                                    oep = '/levenshtein'
                                                }
                                                let uri = `${oep}/off-targets-file`;
                                                let r = await POSTJSON(obj, uri)

                                                const groupedBlocks = {};

                                                r.oligoQuery.forEach(oligo => {
                                                    const [i, j] = oligo.id.split('_').map(Number);

                                                    if (!groupedBlocks[i]) {
                                                        groupedBlocks[i] = {};
                                                    }

                                                    let block = `ID: ${oligo.id} - ${oligo.synthesisSequence}\n`;
                                                    block += "Chr\tStart\tEnd\tStrand\tEdit Distance\n";

                                                    oligo.offtarget.forEach(async off => {
                                                        block += `${off.chr}\t${off.start}\t${off.end}\t${off.strand}\t${off.editdistance}\n`;
                                                        let sitev = {'chr': off.chr, 'start': off.start, 'end': off.end }
                                                        let rs = await exec('https://data.lajollalabs.com/ionworks/py/gene/gff.py', ([sitev]))
                                                        block += '<hr> ' + rs['html']

                                                    });

                                                    groupedBlocks[i][j] = block;
                                                });
                                                const outputRows = [];
                                                const maxColumns = Math.max(...Object.keys(groupedBlocks).map(row => Object.keys(groupedBlocks[row]).length));
                                                Object.keys(groupedBlocks).sort((a, b) => a - b).forEach(i => {
                                                    const row = new Array(maxColumns).fill("");
                                                    Object.keys(groupedBlocks[i]).forEach(j => {
                                                        row[j] = groupedBlocks[i][j];
                                                    });
                                                    outputRows.push(row.join('    '));
                                                });
                                                let output = outputRows.join('\n=============================\n');

                                                console.log('debubg');
                                                if (htmlPanel) {
                                                    htmlPanel.setHTML(generateHTMLTable(r));
                                                }

                                            })
                                        },
                                    ]
                                }
                            }
                        },

                        {
                            'component': {
                                wid: 'html',
                                refCallback: htmlblock,
                                data: ''
                            }
                        },

                    ]]
            }
        }

        showWidget(sequence_input)
    })

}
