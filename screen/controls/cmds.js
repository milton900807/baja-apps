function () {

    return new Promise((resolve, reject) => {
        class CMD {

            currentPath = '/'

            async processCommand(currentPath, commandString) {
                const instance = new CMD();
                instance.currentPath = currentPath || '/';

                const [command, ...params] = commandString.trim().split(/\s+/);

                switch (command) {
                    case 'mv':
                        if (params.length !== 2) {
                            console.error('Usage: mv <source> <destination>');
                            return;
                        }
                        await instance.mv(params[0], params[1]);
                        break;

                    case 'cp':
                        if (params.length !== 2) {
                            console.error('Usage: cp <source> <destination>');
                            return;
                        }
                        await instance.cp(params[0], params[1]);
                        break;

                    case 'rm':
                        if (params.length !== 1) {
                            console.error('Usage: rm <file>');
                            return;
                        }
                        await instance.rm(params[0]);
                        break;

                    case 'tar':
                        if (params.length < 2) {
                            console.error('Usage: tar <action> <file1> <file2> ...');
                            return;
                        }
                        instance.tar(params[0], ...params.slice(1));
                        break;

                    case 'download':
                        if (params.length !== 2) {
                            console.error('Usage: download <url> <destination>');
                            return;
                        }
                        instance.download(params[0], params[1]);
                        break;

                    case 'mkdir':
                        if (params.length !== 1) {
                            console.error('Usage: mkdir <name>');
                            return;
                        }
                        await instance.mkdir(params[0]);
                        break;

                    default:
                        console.error(`Unknown command: ${command}`);
                }
            }

            async mv(source, destination) {

                if (source === destination) {
                    return;
                }

                console.log(`Moving file from ${source} to ${destination}`);
                let host_ = window['env']['apiUrl']
                let jsonobj = {
                    'sourcePath': this.currentPath + '/' + source,
                    'destinationPath': this.currentPath + '/' + destination,
                    'key': 'user',
                    'user': getUser()
                }
                return await POSTJSON(jsonobj, host_ + '/mv');
            }

            cp(source, destination) {
                console.log(`Copying file from ${source} to ${destination}`);
            }
            async rm(file) {
                exec('baja/lib/confirm-widget.js', async () => {

                    console.log(`Removing file: ${file}`);
                    console.log(`rm ${file}`);
                    let host_ = window['env']['apiUrl']
                    let jsonobj = {
                        'path': this.currentPath + '/' + file,
                        'key': 'user',
                        'user': getUser()
                    }
                    POSTJSON(jsonobj, host_ + '/rm').then(r => {
                        resolve ( r )
                    })

                }).then(confirm => {
                    showModal(confirm)
                })
            }
            tar(action, ...files) {
                console.log(`Tar action: ${action}`);
                files.forEach(file => {
                    console.log(`Including file: ${file}`);
                });
            }
            async mkdir(path) {
                console.log(`mkdir ${path}`);
                let host_ = window['env']['apiUrl']
                let jsonobj = {
                    'path': this.currentPath + '/' + path,
                    'key': 'user',
                    'user': getUser()
                }
                POSTJSON(jsonobj, host_ + '/mkdir').then(r => {
                    console.log(r)
                    resolve ( r )
                })
            }
            download(url, destination) {
                console.log(`Downloading from ${url} to ${destination}`);
            }
            async go(currentPath, input) {
                this.currentPath = currentPath;
                if (!this.currentPath) {
                    this.currentPath = '/'
                }

                const [command, ...params] = input.trim().split(/\s+/);

                switch (command) {
                    case 'mv':
                        if (params.length !== 2) {
                            console.error('Usage: mv <source> <destination>');
                            return;
                        }
                        this.mv(...params);
                        break;
                    case 'cp':
                        if (params.length !== 2) {
                            console.error('Usage: cp <source> <destination>');
                            return;
                        }
                        this.cp(...params);
                        break;
                    case 'rm':

                        if (params.length !== 1) {
                            console.error('Usage: rm <file>');
                            return;
                        }
                        this.rm(...params);
                        break;
                    case 'tar':
                        if (params.length < 2) {
                            console.error('Usage: tar <action> <file1> <file2> ...');
                            return;
                        }
                        this.tar(...params);
                        break;
                    case 'download':
                        if (params.length !== 2) {
                            console.error('Usage: download <url> <destination>');
                            return;
                        }
                        this.download(...params);
                        break;
                    case 'mkdir':
                        if (params.length !== 1) {
                            console.error('Usage: mkdir <name>');
                            return;
                        }
                        this.mkdir(...params);
                        break;
                    default:
                        console.error(`Unknown command: ${command}`);
                }
            }
        }
        let c = new CMD();
        resolve(c)

    })
}
