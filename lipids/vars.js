function () {

    let host_ = window['env']['apiUrl']
    let environment__ = {
        get_helm_rule: host + "/get-script",
        save_template: host + "/user/template/save-template",
        get_template: host + "/user/template/get-template",
        list_templates: host + "/user/template/list",
        remove_template: host + "/user/template/remove-template",
        save_data: host + "/lipids-db/save-data",
        get_data: host + "/lipids-db/get-data",
        list_studies: host + "/lipids-db/list-studies",
        get_comments: host + "/lipids-db/get-comments",
        save_comments: host + "/lipids-db/save-comments",
        create_database: host + "/lipids-db/create-database",
        study_type: host + "/lipids-db/get-study-type",
        list_db: host + '/lipids-db/db-list',
        list_table: host + '/lipids-db/table-list',
        get_schema: host + '/lipids-db/get-schema',
        save_function: host + '/lipids-db/save-function',
        get_functions: host + '/lipids-db/get-functions',
        load_function: host + '/lipids-db/load-function',
        save_data_to_table: host + '/lipids-db/save-data-to-study',
        append_json_array_to_json_data_array: host + '/lipids-db/append-data-array',
        get_data_for_list: host + '/lipids-db/get-data-for-list',
        delete_function: host + '/lipids-db/delete-function',
        select: host + '/lipids-db/select-from-table',
        load_study: host + '/lipids-db/load-data',
        save_file: host + '/save-file',
        "SITE_ID": "",
        "ELN_SITE_ID": "",
        "SHAREPOINT_SITE": "",
        "ELN_URL": "",
        "LIST_EXPERIMENTS": "",
        "ELN_DRIVE_ID": "",
        "ELN_FOLDER_ID": "",
        "EXPERIMENT_ID_PREFIX": "",
        "ELN_USERS_GROUP_ID": "", production: false
    }
    return environment__;
}
