// Bridges a Netlify Function request to the application router.
// The router expects /app/... paths, while Netlify delivers /functions/v1/app/...
import { createApplication } from '../../functions/router.mjs';

const API_PATH = /\/(?:\.netlify\/functions\/app|functions\/v1\/app|app)(\/[^?#]*)?$/;

function apiPath(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(API_PATH);
  if (!match) return null;
  return (match[1] || '/') + parsed.search;
}

export function createAppHandler({ db, origin, ready = async () => {} }) {
  const configured = typeof origin === 'function' ? origin() : origin;
  const base = String(configured || '').split(',')[0].trim() || 'https://aura-kids.netlify.app';
  const app = createApplication({ db, origin: configured });

  return async function netlifyHandler(request) {
    const path = apiPath(request.url);
    if (path == null) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    await ready();

    const headers = new Headers(request.headers);
    for (const name of ['host', 'connection', 'content-length', 'transfer-encoding']) headers.delete(name);
    const init = { method: request.method, headers };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();

    const rewritten = new Request(new URL(`/app${path}`, base), init);
    return app({ request: rewritten });
  };
}
