#!/usr/bin/env node
'use strict';
// Builds the GitHub Pages artifact from the explicit allowlist in files.txt, so
// .git, node_modules, tests, local tooling and OS metadata never reach the site.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowlist = path.join(__dirname, 'files.txt');
const IGNORED = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

function entries() {
    return fs.readFileSync(allowlist, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
}
function walk(source, name, output) {
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
        for (const child of fs.readdirSync(source).sort()) {
            if (IGNORED.has(child)) continue;
            walk(path.join(source, child), `${name}/${child}`, output);
        }
        return;
    }
    if (stat.isFile()) output.push({ name, source });
}
function collect() {
    const files = [];
    for (const name of entries()) {
        const source = path.join(root, name);
        if (!fs.existsSync(source)) throw new Error(`deploy/files.txt lists a missing path: ${name}`);
        walk(source, name, files);
    }
    return files;
}
function build(destination) {
    // Guard the recursive delete below: never stage into the repository itself or
    // into one of its parents.
    if (destination === root || root.startsWith(destination + path.sep)) {
        throw new Error(`Refusing to stage into ${destination}`);
    }
    const files = collect();
    fs.rmSync(destination, { recursive: true, force: true });
    for (const file of files) {
        const target = path.join(destination, file.name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file.source, target);
    }
    return files;
}
if (require.main === module) {
    const destination = path.resolve(root, process.argv[2] || '_site');
    const files = build(destination);
    const bytes = files.reduce((total, file) => total + fs.statSync(path.join(destination, file.name)).size, 0);
    console.log(`Staged ${files.length} files (${(bytes / 1048576).toFixed(1)} MB) into ${path.relative(root, destination) || '.'}`);
}
module.exports = { root, entries, collect, build };
