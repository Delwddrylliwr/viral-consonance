import { createServer }    from 'node:http';
import { createReadStream } from 'node:fs';
import { stat }             from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const rel     = pathname === '/' ? 'index.html' : pathname.slice(1);
  const absPath = resolve(join(ROOT, rel));
  if (!absPath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const info = await stat(absPath);
    if (!info.isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': MIME[extname(absPath)] ?? 'application/octet-stream' });
    createReadStream(absPath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Viral Consonance  →  http://localhost:${PORT}`));
