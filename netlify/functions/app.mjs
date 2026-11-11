// Netlify Function entry: same application router, data stored in Netlify Blobs.
import { getStore } from '@netlify/blobs';
import { createBlobDb, ensureSeeded } from '../lib/blob-db.mjs';
import { createAppHandler } from '../lib/app-handler.mjs';
import { loadSeed, applyPasswordOverrides } from '../lib/seed-with-env.mjs';

export const config = { path: '/functions/v1/app/*' };

const store = getStore({ name: 'aura-db', consistency: 'strong' });
const db = createBlobDb(store);
const origins = [process.env.AURA_SITE_ORIGIN, process.env.DEPLOY_PRIME_URL, process.env.URL]
  .filter(Boolean).join(',') || 'https://aura-kids.netlify.app';

let seeding;
const ready = () => {
  seeding ??= (async () => {
    await ensureSeeded(store, loadSeed);
    await applyPasswordOverrides(store, db);
  })().catch((error) => {
    seeding = undefined;
    throw error;
  });
  return seeding;
};

export default createAppHandler({ db, origin: origins, ready });
