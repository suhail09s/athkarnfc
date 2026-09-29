const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { parseRange } = require('../shared.js');
const root = path.resolve(__dirname, '..');
const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
    '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/markdown'
};
const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
    catch (_) { response.writeHead(400).end(); return; }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.stat(file, (error, stat) => {
        if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
        const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
        const range = parseRange(request.headers.range, stat.size);
        if (range?.unsatisfiable) { response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
        if (range) {
            headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
            headers['Content-Length'] = range.end - range.start + 1;
            response.writeHead(206, headers);
            fs.createReadStream(file, range).pipe(response);
        } else {
            headers['Content-Length'] = stat.size;
            response.writeHead(200, headers);
            fs.createReadStream(file).pipe(response);
        }
    });
});
if (require.main === module) {
    // Loopback only by default. Set HOST=0.0.0.0 to open the preview to a phone
    // on the same network; note that a LAN address is not a secure context, so
    // the service worker will not register there.
    const host = process.env.HOST || '127.0.0.1';
    server.listen(Number(process.env.PORT || 4173), host, () => {
        console.log(`Local preview: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${server.address().port}`);
    });
}
module.exports = { types };
