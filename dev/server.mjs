// Local same-origin preview: serves web/ as plain multi-page documents and
// executes the real application routes against the in-memory fixture database. Local only.
import http from 'node:http';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../functions/router.mjs';
import { SESSION_COOKIE } from '../functions/sessions.mjs';
import { createFakeDb } from './fake-db.mjs';
import { buildSeed } from './seed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, 'web');
const port = Number(process.argv[2] || 4173);
const lanWanted = process.argv[3] === 'lan';
const host = lanWanted ? '0.0.0.0' : '127.0.0.1';
// Fixture origin: the deployed guard requires a fixed HTTPS origin; locally the
// harness substitutes it so the same route code runs unchanged.
const DEV_ORIGIN = 'https://aura-spa.local';
const LAN_COOKIE = 'aura_lan.session';
const allowedHosts = new Set(['localhost', '127.0.0.1', ...(lanWanted ? lanAddresses() : [])].map((address) => `${address}:${port}`));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

const db = createFakeDb(await buildSeed());
const handle = createApplication({ db, origin: () => DEV_ORIGIN });

const server = http.createServer(async (req, res) => {
  try {
    if (!allowedHosts.has(req.headers.host)) { res.writeHead(403); res.end('Host forbidden'); return; }
    const origin = `http://${req.headers.host}`;
    const url = new URL(req.url, origin);
    if (url.origin !== origin) { res.writeHead(403); res.end('Host forbidden'); return; }
    if (url.pathname.startsWith('/functions/v1/app')) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) {
        res.writeHead(403, { 'content-type': MIME['.json'] });
        res.end(JSON.stringify({ error: 'origin_forbidden' }));
        return;
      }
      const headers = new Headers(req.headers);
      headers.set('origin', DEV_ORIGIN);
      if (lanWanted && headers.has('cookie')) {
        headers.set('cookie', headers.get('cookie').split(';').map((part) => {
          const cookie = part.trim();
          return cookie.startsWith(`${LAN_COOKIE}=`) ? `${SESSION_COOKIE}=${cookie.slice(LAN_COOKIE.length + 1)}` : cookie;
        }).join('; '));
      }
      const chunks = [];
      let bodyBytes = 0;
      for await (const chunk of req) {
        bodyBytes += chunk.length;
        if (bodyBytes > 3 * 1024 * 1024) { res.writeHead(413); res.end('Request too large'); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      const response = await handle({ request });
      const responseHeaders = Object.fromEntries(response.headers.entries());
      // HTTP LAN demos need a separate cookie; production keeps its secure __Host- cookie.
      if (lanWanted && responseHeaders['set-cookie']?.startsWith(`${SESSION_COOKIE}=`)) {
        responseHeaders['set-cookie'] = responseHeaders['set-cookie'].replace(`${SESSION_COOKIE}=`, `${LAN_COOKIE}=`).replace(/; Secure\b/i, '');
      }
      res.writeHead(response.status, responseHeaders);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let filePath = path.normalize(path.join(webRoot, url.pathname));
    if (!filePath.startsWith(webRoot)) { res.writeHead(403); res.end(); return; }
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory() && !url.pathname.endsWith('/')) {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` });
      res.end();
      return;
    }
    if (info?.isDirectory()) { filePath = path.join(filePath, 'index.html'); info = await stat(filePath).catch(() => null); }
    if (!info && !path.extname(filePath) && !path.extname(url.pathname)) {
      const notFound = await stat(path.join(webRoot, '404.html')).catch(() => null);
      if (notFound) {
        res.writeHead(404, { 'content-type': MIME['.html'] });
        res.end(await readFile(path.join(webRoot, '404.html')));
        return;
      }
    }
    if (!info) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Local preview error');
  }
});

server.listen(port, host, () => {
  console.log('Сайт AURA kids запущен (демо-данные). Не закрывайте это окно.');
  console.log(`  Этот компьютер:  http://127.0.0.1:${port}/`);
  if (lanWanted) {
    const addresses = lanAddresses();
    for (const address of addresses) console.log(`  Телефон и т.д.:  http://${address}:${port}/`);
    if (addresses.length === 0) console.log('  Wi-Fi сеть не найдена — подключите компьютер к сети.');
    console.log('  Устройства должны быть в той же Wi-Fi сети, что и этот компьютер.');
    console.log('  Если сайт не открывается с телефона: разрешите Node.js в брандмауэре Windows (частные сети).');
  }
});

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}