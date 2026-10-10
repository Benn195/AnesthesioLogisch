// Lokale voorbeeldserver met automatisch herbouwen en herladen.
//   npm run dev  →  http://localhost:4321
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
};
const clients = new Set();
const RELOAD = `<script>new EventSource('/__herlaad').onmessage = () => location.reload();</script>`;

await build({ base: '/' });

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/__herlaad') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    let file = path.join(DIST, url);
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    let status = 200;
    if (!fs.existsSync(file)) {
      file = path.join(DIST, '404.html');
      status = 404;
    }
    const ext = path.extname(file);
    let body = fs.readFileSync(file);
    if (ext === '.html') body = body.toString().replace('</body>', RELOAD + '</body>');
    res.writeHead(status, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(body);
  })
  .listen(PORT, () => console.log(`\n  AnesthesioLogisch draait op http://localhost:${PORT}\n`));

let timer;
const herbouw = () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      await build({ base: '/' });
      for (const c of clients) c.write('data: herlaad\n\n');
    } catch (e) {
      console.error(e);
    }
  }, 150);
};
for (const dir of ['inhoud', 'site']) fs.watch(path.join(ROOT, dir), { recursive: true }, (_e, f) => f && !String(f).includes('.obsidian') && herbouw());
