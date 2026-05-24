import { createServer }                              from 'node:http';
import { readFileSync, writeFileSync, existsSync,
         createReadStream }                           from 'node:fs';
import { stat }                                       from 'node:fs/promises';
import { extname, join, resolve }                     from 'node:path';
import { fileURLToPath }                              from 'node:url';

const ROOT        = fileURLToPath(new URL('.', import.meta.url));
const SCORES_FILE = join(ROOT, 'scores.json');
const PORT        = Number(process.env.PORT) || 3000;
const MAX_SCORES  = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

function readScores() {
  if (!existsSync(SCORES_FILE)) return [];
  try { return JSON.parse(readFileSync(SCORES_FILE, 'utf8')); } catch { return []; }
}

function writeScores(scores) {
  writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function collectBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(res, pathname) {
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
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/scores') {
    if (req.method === 'GET') {
      return sendJson(res, 200, readScores());
    }
    if (req.method === 'POST') {
      let body;
      try { body = JSON.parse(await collectBody(req)); }
      catch { return sendJson(res, 400, { error: 'invalid json' }); }

      const name  = (String(body.name ?? 'unknown').trim().substring(0, 14)) || 'unknown';
      const score = Math.max(0, Math.trunc(Number(body.score) || 0));

      const scores = readScores();
      const entry  = { name, score };
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      scores.splice(MAX_SCORES);
      writeScores(scores);

      return sendJson(res, 200, { scores, idx: scores.indexOf(entry) });
    }
    res.writeHead(405); return res.end();
  }

  return serveStatic(res, pathname);
}).listen(PORT, () => console.log(`Viral Consonance  →  http://localhost:${PORT}`));
