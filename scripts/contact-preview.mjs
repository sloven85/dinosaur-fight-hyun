// Separate review entry without modifying the regular game's landing page.
import { createServer } from 'node:http';
import { request } from 'node:http';
createServer((req, res) => {
  const path = req.url === '/' ? '/contact-lab.html' : req.url;
  const upstream = request({ hostname: '127.0.0.1', port: 5182, path, method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:5182' } }, r => {
    res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end('Preview unavailable'); });
  req.pipe(upstream);
}).listen(5181, '0.0.0.0');
