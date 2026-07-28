const fs = require('fs');
const path = require('path');

const dependencies = new Set();

function findDependencies(filePath) {

    console.log ( filePath )
    if (dependencies.has(filePath)) {
        return;
    }
    dependencies.add(filePath);

    const content = fs.readFileSync(filePath, 'utf-8');
    const execRegex = /exec\('([^']+)'/g;

    let match;
    while ((match = execRegex.exec(content)) !== null) {
        const dependencyPath = path.resolve(path.dirname('.'),  match[1]);
        if (fs.existsSync(dependencyPath)) {
            findDependencies(dependencyPath);
        } else {
            console.error(`Dependency not found: ${dependencyPath}`);
        }
    }
}

function deleteUnlistedFiles(dir, rootDir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            deleteUnlistedFiles(filePath, rootDir);
        } else if (filePath.endsWith('.js')) {
            const resolvedPath = path.resolve(filePath);
            if (!dependencies.has(resolvedPath)) {
                console.log(`Deleting: ${resolvedPath}`);
                fs.unlinkSync(resolvedPath);
            }
        }
    });
}

function main() {
    if (process.argv.length < 3 || process.argv.length > 4) {
        console.error('Usage: node dependency-finder.js <starting-file> [--delete-unlisted]');
        process.exit(1);
    }

    const startingFile = path.resolve(process.argv[2]);
    const rootDir = path.resolve('/');

    if (!fs.existsSync(startingFile)) {
        console.error(`File not found: ${startingFile}`);
        process.exit(1);
    }

    findDependencies(startingFile, rootDir);

    const outputFilePath = path.resolve('dependencies.txt');
    fs.writeFileSync(outputFilePath, Array.from(dependencies).join('\n'), 'utf-8');
    console.log(`Dependencies written to ${outputFilePath}`);

    if (process.argv.length === 4 && process.argv[3] === '--delete-unlisted') {
        deleteUnlistedFiles(rootDir, rootDir);
        console.log('Unlisted .js files have been deleted.');
    }
}
main();
