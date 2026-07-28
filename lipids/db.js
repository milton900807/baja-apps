function () {
    return new Promise((resolve, reject) => {
        exec('lipids/vars.js').then(environment => {

            let DB = class DB {
                async save(db_target, study_label, dobj) {
                    let jsonobj = {
                        'table_name': db_target,
                        'study_name': study_label,
                        'userid': 'jeffm@.com',
                        'data': dobj
                    }
                    let r = await POSTJSON(jsonobj, environment.save_data_to_table)
                    if (r['status'] === 'success') {
                        console.log(" Success ")

                    } else {
                        console.log(" Failed ")
                    }
                }

                async append(db_target, study_label, dobj) {
                    let jsonobj = {
                        'table_name': db_target,
                        'study_name': study_label,
                        'userid': 'jeffm@.com',
                        'data': dobj
                    }
                    let r = await POSTJSON(jsonobj, environment.append_json_array_to_json_data_array)
                    if (r['status'] === 'success') {

                        console.log(" Success ")

                    } else {

                        console.log(" Failed ")
                    }
                }

                async select(db_target, study_name, select_statement) {
                    let js = {
                        table_target: db_target,
                        study_name: study_name,
                        qstring: select_statement
                    }
                    return await POSTJSON(js, environment.select)
                }

                async loadStudy(db_target, study_label) {
                    let jsonobj = {
                        'target': db_target,
                        'study': study_label,
                    }
                    return await GETJSON(environment.load_study + `/?target=${db_target}&study=${study_label}`)
                }

                async getData(db_target, study_label, dobj) {
                    let jsonobj = {
                        'target': db_target,
                        'study': study_label,
                        'data': dobj
                    }
                    return await POSTJSON(jsonobj, environment.get_data_for_list)
                }
            }
            resolve(new DB());
        });

    })
}
