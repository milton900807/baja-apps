function () {

    return new Promise(async (resolve, reject) => {

        let f = class FunFactory {

            static createUI(arg, pt, selectedWB) {
                if (arg) {
                    arg = arg.trim();
                }

                if (arg.toLowerCase() === 'omit_compounds_with_label') {
                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Enter the compound IDs you want to omit from the calculation. (comma delimited if more than one) '
                                        }
                                    },
                                    {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Group'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                        let v = input_params['Group']
                                                        if (!v || v.length <= 0) {
                                                            v = 'STD'
                                                        }
                                                        selectedWB.setParam(arg, v);

                                                        hideAllModal();
                                                        let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)
                                                        pt.updateworkbench({
                                                            mouseMoveListener: m.mouseMoveListener,
                                                            mouseUpListener: m.mouseUpListener,
                                                            mouseDownListener: m.mouseDownListener,
                                                            draw: m.draw,
                                                            menuManager: m.menuManager
                                                        })

                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });
                } else
                    if (arg.toLowerCase() === 'Standard_group'.toLowerCase()) {
                        showModal({
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            width: '100%',
                                            'component':
                                            {
                                                wid: 'html', data: 'Enter the name of the group that contains the dilution series (Defualt is STD) '
                                            }
                                        },
                                        {
                                            width: '100%',
                                            'component': {
                                                wid: 'input-param-items',
                                                data: {
                                                    input_labels: ['Group'],
                                                    buttons: [{
                                                        'label': 'Cancel', 'function': createIonFunction(async (button_label, input_params) => {
                                                            let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)
                                                            pt.updateworkbench({
                                                                mouseMoveListener: m.mouseMoveListener,
                                                                mouseUpListener: m.mouseUpListener,
                                                                mouseDownListener: m.mouseDownListener,
                                                                draw: m.draw,
                                                                menuManager: m.menuManager
                                                            })

                                                            hideAllModal();
                                                        })
                                                    }, {
                                                        'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                            let v = input_params['Group']
                                                            if (!v || v.length <= 0) {
                                                                v = 'STD'
                                                            }
                                                            selectedWB.setParam(arg, v);
                                                            hideAllModal();
                                                            let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)

                                                            pt.updateworkbench({
                                                                mouseMoveListener: m.mouseMoveListener,
                                                                mouseUpListener: m.mouseUpListener,
                                                                mouseDownListener: m.mouseDownListener,
                                                                draw: m.draw,
                                                                menuManager: m.menuManager
                                                            })

                                                        })
                                                    }]
                                                }
                                            }
                                        }
                                    ]
                                ]
                            }
                        });

                    }
                    else if ( arg.toLowerCase () === 'operation_groups'){
                        showModal({
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            width: '100%',
                                            'component':
                                            {
                                                wid: 'html', data: 'Enter the names of the groups (seperated by comma) to adjust for the standard curve'
                                            }
                                        },
                                        {
                                            width: '100%',
                                            'component': {
                                                wid: 'input-param-items',
                                                data: {
                                                    input_labels: ['Group'],
                                                    buttons: [{
                                                        'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                            hideAllModal();
                                                        })
                                                    }, {
                                                        'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                            let v = input_params['Group']
                                                            if (!v || v.length <= 0) {
                                                                v = ''
                                                            }

                                                            v = v.trim()
                                                            v = v.replace ( ' ', '')
                                                            if ( v.indexOf (',')>0){
                                                                v = v.split ( ',')
                                                            }else
                                                            {
                                                                v = [v.trim()]
                                                            }
                                                            selectedWB.setParam(arg, v);
                                                            hideAllModal();
                                                            let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)
                                                            pt.updateworkbench({
                                                                mouseMoveListener: m.mouseMoveListener,
                                                                mouseUpListener: m.mouseUpListener,
                                                                mouseDownListener: m.mouseDownListener,
                                                                draw: m.draw,
                                                                menuManager: m.menuManager
                                                            })

                                                        })
                                                    }]
                                                }
                                            }
                                        }
                                    ]
                                ]
                            }
                        });

                    }
                    else
                        if (arg.toLowerCase() === 'omit_group'.toLowerCase()) {
                            showModal({
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                width: '100%',
                                                'component':
                                                {
                                                    wid: 'html', data: 'Enter the name of the group that you owant to exclude from the calculation'
                                                }
                                            },
                                            {
                                                width: '100%',
                                                'component': {
                                                    wid: 'input-param-items',
                                                    data: {
                                                        input_labels: ['Group'],
                                                        buttons: [{
                                                            'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                                hideAllModal();
                                                            })
                                                        }, {
                                                            'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                                let v = input_params['Group']
                                                                if (!v || v.length <= 0) {
                                                                    v = 'STD'
                                                                }
                                                                selectedWB.setParam(arg, v);
                                                                hideAllModal();
                                                                let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)

                                                                pt.updateworkbench({
                                                                    mouseMoveListener: m.mouseMoveListener,
                                                                    mouseUpListener: m.mouseUpListener,
                                                                    mouseDownListener: m.mouseDownListener,
                                                                    draw: m.draw,
                                                                    menuManager: m.menuManager
                                                                })

                                                            })
                                                        }]
                                                    }
                                                }
                                            }
                                        ]
                                    ]
                                }
                            });

                        } else {

                            let smenu;
                            let md = false;
                            let t = {
                                mouseDownListener: async (x, y) => {
                                    let xw = pt.grid.Xwc(x);
                                    let yw = pt.grid.Ywc(y);
                                    pt.deselectPlateRoots();
                                    let v = pt.getPlate(xw, yw);
                                    if (v) {
                                        console.log(' v name ' + v.name)
                                        if (v && selectedWB) {
                                            selectedWB.setParam(arg, v);
                                            v.selectIt();
                                        }
                                    }
                                    md = true;
                                },
                                mouseMoveListener: async (x, y) => {
                                    let xw = (pt.grid.Xwc(x));
                                    let yw = (pt.grid.Ywc(y));
                                    pt.deselectPlateRoots();
                                    let v = pt.getPlate(xw, yw);
                                    if (v)
                                        v.selectIt();
                                    if (md) {

                                    }
                                },
                                mouseUpListener: async (x, y) => {
                                    let mmx = pt.grid.Xwc(x + 10);
                                    let mmy = pt.grid.Ywc(y + 10);
                                    md = false;

                                    let m = await exec('baja/plate/views/edit-workbench-function-on-canvas.js', pt)

                                    pt.deselectPlateRoots();
                                    pt.updateworkbench({
                                        mouseMoveListener: m.mouseMoveListener,
                                        mouseUpListener: m.mouseUpListener,
                                        mouseDownListener: m.mouseDownListener,
                                        draw: m.draw,
                                        menuManager: m.menuManager
                                    })

                                }
                                ,
                                draw: (grid, ctx) => {
                                    if (ctx != undefined && grid != undefined) {
                                        ctx.lineWidth = 1;
                                        ctx.strokeStyle = 'lightBlue';
                                        ctx.beginPath();

                                        ctx.stroke();
                                    }
                                },
                                menuManager: (pt, ctx) => {
                                    if (smenu) {
                                        smenu.draw(ctx, pt.grid)
                                    }
                                }

                            }
                            return t;

                        }

            }

            static async create(type) {

                if (!type) {
                    return;
                }

                if (type.toLowerCase() === 'all->well address') {
                    let fun = (from, to) => {
                        for (let y = 0; y < from.grid.ymax; y++) {
                            for (let x = 0; x < from.grid.xmax; x++) {
                                to.wells[x][y].value = from.wells[x][y].value;
                                to.wells[x][y].concentration = from.wells[x][y].concentration;
                                to.wells[x][y].appendGroups (from.wells[x][y].getGroups());
                                to.wells[x][y].color = from.wells[x][y].color;
                                to.wells[x][y].structure = from.wells[x][y].structure;
                                to.wells[x][y].compoundId = from.wells[x][y].compoundId;
                                if (to.wells[x][y].source && to.wells[x][y].source.length > 0) {
                                    to.wells[x][y].source.push({
                                        'plate': from.uid,
                                        'x': x,
                                        'y': y
                                    })
                                } else {
                                    to.wells[x][y].source = [{
                                        'plate': from.uid,
                                        'x': x,
                                        'y': y
                                    }]
                                }
                            }
                        }
                    }
                    return fun;
                } else
                    if (type.toLowerCase() === 'all') {
                        let fun = (from, to) => {
                            for (let y = 0; y < from.grid.ymax; y++) {
                                for (let x = 0; x < from.grid.xmax; x++) {
                                    to.wells[x][y].value = from.wells[x][y].value;
                                    to.wells[x][y].concentration = from.wells[x][y].concentration;
                                    to.wells[x][y].appendGroups (from.wells[x][y].getGroups());
                                    to.wells[x][y].color = from.wells[x][y].color;
                                    to.wells[x][y].structure = from.wells[x][y].structure;
                                    to.wells[x][y].compoundId = from.wells[x][y].compoundId;
                                    if (to.wells[x][y].source && to.wells[x][y].source.length > 0) {
                                        to.wells[x][y].source.push({
                                            'plate': from.uid,
                                            'x': x,
                                            'y': y
                                        })
                                    } else {
                                        to.wells[x][y].source = [{
                                            'plate': from.uid,
                                            'x': x,
                                            'y': y
                                        }]
                                    }
                                }
                            }
                        }
                        return fun;
                    } else if (type.toLowerCase() === 'normalize') {

                        let fun = (reference, signal, to) => {
                            for (let y = 0; y < reference.grid.ymax; y++) {
                                for (let x = 0; x < reference.grid.xmax; x++) {
                                    to.wells[x][y].appendGroups (from.wells[x][y].getGroups());
                                    to.wells[x][y].color = reference.wells[x][y].color;
                                    to.wells[x][y].structure = reference.wells[x][y].structure;
                                    to.wells[x][y].compoundId = reference.wells[x][y].compoundId;
                                    to.wells[x][y].concentration = reference.wells[x][y].concentration;
                                    to.wells[x][y].value = signal.wells[x][y].value / reference.wells[x][y].value;
                                }
                            }
                        }
                        return fun;
                    } else if (type.toLowerCase() === 'standard curve on plate') {

                        let fun = async (Connect_plate, Standard_group, omit_compounds_with_label, omit_group) => {
                            let plate = Connect_plate;
                            if (omit_compounds_with_label != null && omit_compounds_with_label.indexOf(',') > 0) {
                                console.log(" we are going to omit multiple groups ")
                            }
                            let Regression = await exec('flexigraph/math/regression.js')
                            let groupWells = plate.getGroup(Standard_group);
                            if (groupWells && groupWells.length > 0) {

                                let row = 0;
                                let data = {};
                                for (let d of groupWells) {
                                    let concentration = +d.concentration;
                                    let value = +d.value;
                                    let vf = data[concentration]
                                    if (!vf) {
                                        data[concentration] = ([value])
                                    } else {
                                        vf.push(value)
                                        data[concentration] = vf;
                                    }
                                }

                                let ddata = new Array()
                                for (let key of Object.keys(data)) {
                                    let values = data[key]
                                    if (values.length > 1) {
                                        let sum = 0;
                                        for (let v of values) {
                                            sum += v;
                                        }
                                        let avg = sum / values.length;
                                        ddata[row] = new Array()
                                        ddata[row].push(parseFloat(key));
                                        ddata[row++].push(parseFloat(avg));
                                    } else {

                                        let avg = values[0];
                                        ddata[row] = new Array()
                                        ddata[row].push(parseFloat(key));
                                        ddata[row++].push(parseFloat(avg));

                                    }
                                }
                                let options = {
                                    order: 2,
                                    precision: 7,
                                }
                                let r = Regression.linear(ddata, options)

                                for (let y = 0; y < plate.grid.ymax; y++) {
                                    for (let x = 0; x < plate.grid.xmax; x++) {
                                        if (plate.wells[x][y].group != undefined && ((omit_compounds_with_label && plate.wells[x][y].compoundId.toLowerCase() === omit_compounds_with_label.toLowerCase()) ||
                                            (omit_group && plate.wells[x][y].group.toLowerCase() === omit_group.toLowerCase()) ||
                                            plate.wells[x][y].group.toLowerCase() === Standard_group.toLowerCase())) {
                                            console.log(" skipping the well " + plate.wells[x][y].name)
                                            console.log(" skipping the well " + plate.wells[x][y].group)
                                        }
                                        else {
                                            if (plate.wells[x][y].value != undefined || (!isNaN(plate.wells[x][y].value))) {
                                                let correctedValue = (plate.wells[x][y].value - r.equation[1]) / r.equation[0];
                                                console.log(' corrected value ' + correctedValue)
                                                plate.wells[x][y].value = correctedValue.toPrecision(6);
                                            }
                                        }
                                    }
                                }

                                let results = {
                                    'regression': r,
                                    'data': data
                                }
                                return (results);

                            } else {
                                showModal({
                                    wid: 'json',
                                    data: '{"MSG":"NOT COMPLETE; group wells is not iterable", "GROUP":' + Standard_group + '}'
                                })

                            }
                            let results = {
                                'status': 'failed'
                            }
                            return results;

                        }
                        return fun;

                    }
                    else if (type.toLowerCase() === 'standard curve on group') {

                        let fun = async (Connect_plate, Standard_group, Operation_groups) => {
                            let plate = Connect_plate;
                            let Regression = await exec('flexigraph/math/regression.js')
                            let groupWells = plate.getGroup(Standard_group);
                            if (groupWells && groupWells.length > 0) {
                                let row = 0;
                                let data = {};
                                for (let d of groupWells) {
                                    let concentration = +d.concentration;
                                    let value = +d.value;
                                    let vf = data[concentration]
                                    if (!vf) {
                                        data[concentration] = ([value])
                                    } else {
                                        vf.push(value)
                                        data[concentration] = vf;
                                    }
                                }

                                let ddata = new Array()
                                for (let key of Object.keys(data)) {
                                    let values = data[key]
                                    if (values.length > 1) {
                                        let sum = 0;
                                        for (let v of values) {
                                            sum += v;
                                        }
                                        let avg = sum / values.length;
                                        ddata[row] = new Array()
                                        ddata[row].push(parseFloat(key));
                                        ddata[row++].push(parseFloat(avg));
                                    } else {

                                        let avg = values[0];
                                        ddata[row] = new Array()
                                        ddata[row].push(parseFloat(key));
                                        ddata[row++].push(parseFloat(avg));

                                    }
                                }

                                let options = {
                                    order: 2,
                                    precision: 7,
                                }
                                let r = Regression.linear(ddata, options)
                                for (let y = 0; y < plate.grid.ymax; y++) {
                                    for (let x = 0; x < plate.grid.xmax; x++) {
                                        if (plate.wells[x][y].group != undefined) {
                                            for (let opg of Operation_groups) {
                                                if (plate.wells[x][y].group.toLowerCase() === opg.toLowerCase()) {
                                                    let correctedValue = (plate.wells[x][y].value - r.equation[1]) / r.equation[0];
                                                    console.log(' corrected value ' + correctedValue)
                                                    plate.wells[x][y].value = correctedValue.toPrecision(6);
                                                }
                                            }
                                        }
                                    }
                                }

                                let results = {
                                    'regression': r,
                                    'data': data,
                                    'average': ddata
                                }
                                return (results);

                            } else {
                                showModal({
                                    wid: 'json',
                                    data: '{"MSG":"NOT COMPLETE; group wells is not iterable", "GROUP":' + Standard_group + '}'
                                })

                            }
                            let results = {
                                'status': 'failed'
                            }
                            return results;

                        }
                        return fun;
                    }
                    else if (type.toLowerCase() === 'percent ctrl') {
                        let fun = (Plate, Export_To) => {
                            let groupWells = Plate.getGroup('UTC');
                            let row = 0;
                            let data = {};
                            let sum = 0;
                            for (let d of groupWells) {
                                let value = +d.value;
                                console.log(" value " + d.value + " _d " + value);
                                sum += value;
                            }
                            let avg_ctrl = sum / groupWells.length;
                            for (let y = 0; y < Export_To.grid.ymax; y++) {
                                for (let x = 0; x < Export_To.grid.xmax; x++) {
                                    Export_To.wells[x][y].value = Plate.wells[x][y].value / avg_ctrl;
                                    Export_To.wells[x][y].appendGroups( Plate.wells[x][y].getGroups () );
                                    Export_To.wells[x][y].concentration = Plate.wells[x][y].concentration;
                                    Export_To.wells[x][y].color = Plate.wells[x][y].color;
                                    Export_To.wells[x][y].structure = Plate.wells[x][y].structure;
                                    Export_To.wells[x][y].compoundId = Plate.wells[x][y].compoundId;

                                }
                            }
                        }
                        return fun;

                    }
            }
        }

        resolve(f)
    })

}
