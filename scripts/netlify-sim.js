'use strict';
// Simule Netlify en local : sert dist/ et route POST /api/register vers la fonction.
// Usage : npm run build:static && node scripts/netlify-sim.js   (variables d'environnement comme sur Netlify)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('../netlify/functions/register');
const dist = path.join(__dirname, '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/register')) {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', async () => {
      const r = await handler({ httpMethod: req.method, body: b, isBase64Encoded: false });
      res.writeHead(r.statusCode, r.headers);
      res.end(r.body);
    });
    return;
  }
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = path.join(dist, path.normalize(p));
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(parseInt(process.env.PORT || '3200', 10), () => console.log('Simulation Netlify prête'));
