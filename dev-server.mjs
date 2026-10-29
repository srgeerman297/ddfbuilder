// Local stand-in for Cloudflare Pages, for testing: serves public/ with the headers from
// public/_headers and runs functions/api/claude.js at /api/claude.
//   ANTHROPIC_API_KEY=... node dev-server.mjs         (real Claude)
//   MOCK_CLAUDE=./mock.mjs node dev-server.mjs        (a module whose default export replaces fetch to Anthropic)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const fn = await import(pathToFileURL(path.join(dir, 'functions/api/claude.js')));
if (process.env.MOCK_CLAUDE) { const realFetch = globalThis.fetch; const mock = (await import(pathToFileURL(path.resolve(process.env.MOCK_CLAUDE)))).default; globalThis.fetch = (u, o) => String(u).startsWith('https://api.anthropic.com') ? mock(u, o) : realFetch(u, o); }
const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || (process.env.MOCK_CLAUDE ? 'mock' : ''), ACCESS_CODE: process.env.ACCESS_CODE || '', MODEL_QUICK: process.env.MODEL_QUICK, MODEL_DEFAULT: process.env.MODEL_DEFAULT };
// Headers for "/*" from public/_headers (enough for this site).
const hdrs = {}; let cur = null;
for (const line of fs.readFileSync(path.join(dir, 'public/_headers'), 'utf8').split('\n')) {
  if (/^\S/.test(line)) cur = line.trim() === '/*' ? hdrs : null;
  else if (cur && line.includes(':')) { const i = line.indexOf(':'); cur[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/claude') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const h = req.method === 'GET' ? fn.onRequestGet : req.method === 'POST' ? fn.onRequestPost : null;
    const r = h ? await h({ request, env }) : new Response('Method not allowed', { status: 405 });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  const p = path.join(dir, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!p.startsWith(path.join(dir, 'public')) || !fs.existsSync(p) || path.basename(p) === '_headers') { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { ...hdrs, 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(process.env.PORT || 8788, () => console.log(`DDF Builder on http://localhost:${process.env.PORT || 8788}`));
