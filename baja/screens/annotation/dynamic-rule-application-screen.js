function (graph) {
    let tname = ['GGGG', 'GC content']
    let selectP;
    let selectPanel = createIonFunction(async (_panel) => {
        selectP = _panel;
    });

    let t = {
        wid: 'selection-list',
        data: {
            single_selection: true,
            button_label: 'Apply',
            listItems: tname,
            button_function: createIonFunction(async (items) => {
                let rule = await exec('baja/screens/annotation/rule-filter.js');

                let my_rules = [];

                my_rules.push(new rule(null, 'nucleotide-content', 'G/C,0.30,0.7', 2));
                my_rules.push(new rule(null, 'nucleotide-content', 'A/C,0.25,0.75', 4));
                my_rules.push(new rule(null, 'nucleotide-content', 'T/C,0.25,0.75', 4));
                my_rules.push(new rule(null, 'nucleotide-content', 'CG,0,0.25', 2));
                my_rules.push(new rule(null, 'pattern', 'TTTTTT', 3));
                my_rules.push(new rule(null, 'pattern', 'AAAAAA', 3));
                my_rules.push(new rule(null, 'pattern', 'CCCCCC', 2));
                my_rules.push(new rule(null, 'pattern', 'GGGGG', 2));
                my_rules.sort((_a, _b) => _a.priority - _b.priority);

                let nofilter = 0;
                let rulePriorities = [];
                for (let i = 0; i < my_rules.length; i++) {
                    rulePriorities.push(my_rules[i].priority);
                }

                let priority = rulePriorities[0];
                for (let i = 0; i < rulePriorities.length; i++) {

                    for (let track of graph.track) {

                        let count = 0;
                        for (let o of track.oligos) {
                            if (o.filter == 1) {
                                count += 1;
                            }
                        }
                        if (my_rules[i].priority > 2) {
                            nofilter = 1;
                        }
                        if (my_rules[i].priority != priority) {

                            if (count < 0) {
                                nofilter = 1;
                            }
                        }
                        console.log(my_rules[i]);
                        console.log(priority)
                        console.log(nofilter);
                        await my_rules[i].applyrule(track.oligos, nofilter);
                        priority = my_rules[i].priority;
                    }
                }
            })
        }

    }

    showModal(t)

}
