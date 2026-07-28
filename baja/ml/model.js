return new Promise(async (resolve, reject) => {

    let Model = class Model {
        name = 'untitled';
        type = 'sequence_context';
        window = 200;
        encoding = 'one-hot'

        constructor(type, name) {
            this.type = type;
            this.name = '' + (name);
        }
    }
    resolve(Model);
});
