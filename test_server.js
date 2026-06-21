const http = require('http');

const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        console.log(`\n=== ${req.method} ${req.url} ===`);
        console.log(req.rawHeaders.map((h, i) => i % 2 === 0 ? `${h}: ${req.rawHeaders[i+1]}` : null).filter(Boolean).join('\n'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, token: "test", exp: 123, tracks: [{name: "test"}] }));
    });
});

server.listen(9999, () => {
    console.log("Listening on 9999");
});
