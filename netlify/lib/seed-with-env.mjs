// Seed data for the Netlify deployment. The owner and admin accounts get random
// passwords unless Netlify environment variables provide real ones.
import { buildSeed } from '../../dev/seed.mjs';
import { hashPassword } from '../../functions/passwords.mjs';
import { sha256Hex } from '../../functions/sessions.mjs';

const ROLES = ['owner', 'admin'];

const envPassword = (role) => (role === 'owner' ? process.env.AURA_OWNER_PASSWORD : process.env.AURA_ADMIN_PASSWORD);

async function setPassword(db, userId, password) {
  const derived = await hashPassword(password);
  const updated = await db.from('users').update({
    password_salt: derived.salt,
    password_hash: derived.hash,
    password_iterations: derived.iterations,
  }).eq('id', userId).select('id');
  return Array.isArray(updated?.data) && updated.data.length === 1;
}

export async function loadSeed() {
  const seed = await buildSeed();
  for (const role of ROLES) {
    const user = seed.users.find((item) => item.role === role);
    if (!user) continue;
    const password = envPassword(role) ?? `disabled-${crypto.randomUUID()}-${role}`;
    const derived = await hashPassword(password);
    Object.assign(user, {
      password_salt: derived.salt,
      password_hash: derived.hash,
      password_iterations: derived.iterations,
    });
  }
  return seed;
}

// Applies environment passwords to an already seeded store, so credentials can
// be set or rotated in Netlify without wiping Blobs data.
export async function applyPasswordOverrides(store, db) {
  const desired = {};
  for (const role of ROLES) {
    const password = envPassword(role);
    if (password) desired[role] = { password, digest: await sha256Hex(`${role}:${password}`) };
  }
  if (Object.keys(desired).length === 0) return;

  const raw = await store.get('meta/password-overrides');
  let applied = {};
  try { applied = raw ? JSON.parse(raw) : {}; } catch { applied = {}; }

  for (const [role, { password, digest }] of Object.entries(desired)) {
    if (applied[role] === digest) continue;
    const found = await db.from('users').select('id').eq('role', role).limit(1);
    const userId = Array.isArray(found?.data) && found.data.length === 1 ? found.data[0].id : null;
    if (!userId) continue;
    if (await setPassword(db, userId, password)) applied[role] = digest;
  }
  await store.set('meta/password-overrides', JSON.stringify(applied));
}
