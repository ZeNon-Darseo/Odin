// Route-level checks against the real application code with the fixture database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../functions/router.mjs';
import { createFakeDb } from './fake-db.mjs';
import { buildSeed, SERVICE_IDS } from './seed.mjs';

const ORIGIN = 'https://aura-spa.local';
const day = (offset) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);

async function harness() {
  const db = createFakeDb(await buildSeed());
  const handle = createApplication({ db, origin: () => ORIGIN });
  const call = async (method, path, { body, cookie, origin = ORIGIN } = {}) => {
    const headers = { origin };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const response = await handle({ request: new Request(`https://aura-spa.local/functions/v1/app${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }) });
    const setCookie = response.headers.get('set-cookie');
    const data = await response.json().catch(() => null);
    return { status: response.status, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
  };
  return { db, call };
}

test('health and public catalog', async () => {
  const { call } = await harness();
  assert.equal((await call('GET', '/api/health')).status, 200);
  const services = await call('GET', '/api/services');
  assert.equal(services.status, 200);
  assert.equal(services.data.length, 9);
  assert.ok(services.data.every((service) => service.active === undefined));
  const milk = services.data.find((service) => service.id === SERVICE_IDS.milk);
  assert.equal(milk.title_kk, 'Бұлтты сүт ваннасы');
  assert.equal(milk.title_en, 'Milky bath with clouds');
  assert.ok(milk.description_kk.length > 10);
  assert.ok(milk.description_en.length > 10);
});

test('register, session, duplicate email and weak password', async () => {
  const { call } = await harness();
  const weak = await call('POST', '/api/register', { body: { name: 'Тест', email: 't@example.com', password: 'short' } });
  assert.equal(weak.status, 400);
  const registered = await call('POST', '/api/register', { body: { name: 'Ольга Тест', email: 'olga@example.com', password: 'Olga-Password-1', phone: '+7 916 000-11-22' } });
  assert.equal(registered.status, 201);
  assert.ok(registered.cookie.startsWith('__Host-app_auth.session='));
  const me = await call('GET', '/api/me', { cookie: registered.cookie });
  assert.equal(me.data.user.email, 'olga@example.com');
  assert.equal(me.data.user.role, 'client');
  const dup = await call('POST', '/api/register', { body: { name: 'Ольга Тест', email: 'olga@example.com', password: 'Olga-Password-1' } });
  assert.equal(dup.status, 409);
  const anonymous = await call('GET', '/api/me');
  assert.equal(anonymous.status, 401);
});

test('login rejects wrong password and accepts correct one', async () => {
  const { call } = await harness();
  const wrong = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'Wrong-Password-1' } });
  assert.equal(wrong.status, 401);
  const ok = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.name, 'Анна Смирнова');
});

test('origin guard and method guards', async () => {
  const { call } = await harness();
  const forged = await call('POST', '/api/login', { body: { email: 'a@b.co', password: 'Whatever-123' }, origin: 'https://evil.example' });
  assert.equal(forged.status, 403);
  assert.equal((await call('GET', '/api/login')).status, 405);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});

test('availability reflects holds and booking flow is atomic', async () => {
  const { call } = await harness();
  const login = await call('POST', '/api/login', { body: { email: 'elena.v@example.com', password: 'GuestDemo-2026' } });
  const cookie = login.cookie;
  const date = day(5);
  const before = await call('GET', `/api/availability?service_id=${SERVICE_IDS.milk}&date=${date}`);
  assert.ok(before.data.slots.find((slot) => slot.time === '12:00').available);

  const created = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '12:00', participants: [{ name: 'Софья', age: 6 }], payment_method: 'card', name: 'Елена Верещагина', phone: '+7 926 415-90-33', comment: 'Окно, пожалуйста' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'pending');
  assert.deepEqual(created.data.participants, [{ name: 'Софья', age: 6 }]);
  assert.equal(created.data.payment_method, 'card');

  const badAge = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '13:00', participants: [{ name: 'Софья', age: 0 }], payment_method: 'card', name: 'Елена Верещагина', phone: '+7 926 415-90-33' },
  });
  assert.equal(badAge.status, 400);

  const race = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '12:00', participants: [{ name: 'Софья', age: 6 }], payment_method: 'cash', name: 'Елена Верещагина', phone: '+7 926 415-90-33' },
  });
  assert.equal(race.status, 409);
  assert.equal(race.data.error, 'slot_taken');

  const after = await call('GET', `/api/availability?service_id=${SERVICE_IDS.milk}&date=${date}`);
  assert.equal(after.data.slots.find((slot) => slot.time === '12:00').available, false);

  const mine = await call('GET', '/api/bookings', { cookie });
  const own = mine.data.find((booking) => booking.id === created.data.id);
  assert.equal(own.service_title, 'Молочная ванна с облаками');
  assert.deepEqual(own.participants, [{ name: 'Софья', age: 6 }]);
  assert.equal(own.payment_method, 'card');

  const cancelled = await call('POST', `/api/bookings/${created.data.id}/cancel`, { cookie });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.status, 'cancelled');
  const freed = await call('GET', `/api/availability?service_id=${SERVICE_IDS.milk}&date=${date}`);
  assert.equal(freed.data.slots.find((slot) => slot.time === '12:00').available, true);
});

test('a booking can include several children at one slot', async () => {
  const { call } = await harness();
  const login = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  const cookie = login.cookie;
  const date = day(6);
  const participants = [{ name: 'Аня', age: 6 }, { name: 'Марк', age: 4 }, { name: 'Лев', age: 9 }];

  const created = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '14:00', participants, payment_method: 'cash', name: 'Анна Смирнова', phone: '+7 916 204-11-87' },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.participants, participants);
  assert.equal(created.data.payment_method, 'cash');
  assert.equal(created.data.price, 2900);

  const own = (await call('GET', '/api/bookings', { cookie })).data.find((booking) => booking.id === created.data.id);
  assert.deepEqual(own.participants, participants);
  assert.equal(own.payment_method, 'cash');

  const badPayment = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '15:00', participants, payment_method: 'crypto', name: 'Анна Смирнова', phone: '+7 916 204-11-87' },
  });
  assert.equal(badPayment.status, 400);
  assert.equal(badPayment.data.error, 'invalid_payment');

  const tooMany = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '15:00', participants: Array.from({ length: 7 }, (_, i) => ({ name: `Гость ${i}`, age: 5 })), payment_method: 'card', name: 'Анна Смирнова', phone: '+7 916 204-11-87' },
  });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.data.error, 'invalid_participants');

  const empty = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '16:00', participants: [], payment_method: 'card', name: 'Анна Смирнова', phone: '+7 916 204-11-87' },
  });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.error, 'invalid_participants');

  const badName = await call('POST', '/api/bookings', {
    cookie,
    body: { service_id: SERVICE_IDS.milk, date, slot: '17:00', participants: [{ name: 'А', age: 5 }], payment_method: 'card', name: 'Анна Смирнова', phone: '+7 916 204-11-87' },
  });
  assert.equal(badName.status, 400);
  assert.equal(badName.data.error, 'invalid_child_name');
});

test('bookings are owner-scoped', async () => {
  const { call } = await harness();
  const anna = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  const marina = await call('POST', '/api/login', { body: { email: 'marina.k@example.com', password: 'GuestDemo-2026' } });
  const annaList = await call('GET', '/api/bookings', { cookie: anna.cookie });
  const target = annaList.data[0];
  const intruder = await call('POST', `/api/bookings/${target.id}/cancel`, { cookie: marina.cookie });
  assert.equal(intruder.status, 404);
});

test('comments: public feed, posting, ownership and admin moderation', async () => {
  const { call } = await harness();
  const feed = await call('GET', '/api/comments');
  assert.equal(feed.status, 200);
  assert.equal(feed.data.length, 5);
  assert.ok(feed.data.every((comment) => comment.user_id === undefined && comment.status === undefined));
  assert.ok(feed.data.every((comment) => typeof comment.service_title === 'string' || comment.service_title === null));

  assert.equal((await call('POST', '/api/comments', { body: { rating: 5, body: 'Отличная студия' } })).status, 401);

  const anna = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  const short = await call('POST', '/api/comments', { cookie: anna.cookie, body: { rating: 5, body: 'Ок' } });
  assert.equal(short.status, 400);
  assert.equal(short.data.error, 'invalid_review');
  const badRating = await call('POST', '/api/comments', { cookie: anna.cookie, body: { rating: 6, body: 'Очень понравилось, придём снова' } });
  assert.equal(badRating.status, 400);

  const created = await call('POST', '/api/comments', {
    cookie: anna.cookie,
    body: { rating: 5, body: 'Очень понравилось, придём снова', service_id: SERVICE_IDS.milk },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.author_name, 'Анна Смирнова');
  assert.equal(created.data.service_title, 'Молочная ванна с облаками');
  assert.equal((await call('GET', '/api/comments')).data.length, 6);

  const marina = await call('POST', '/api/login', { body: { email: 'marina.k@example.com', password: 'GuestDemo-2026' } });
  assert.equal((await call('DELETE', `/api/comments/${created.data.id}`, { cookie: marina.cookie })).status, 403);
  assert.equal((await call('DELETE', `/api/comments/${created.data.id}`, { cookie: anna.cookie })).status, 200);
  assert.equal((await call('GET', '/api/comments')).data.length, 5);

  const admin = await call('POST', '/api/login', { body: { email: 'admin@aura-kids.ru', password: 'Aura-Admin-2026' } });
  const adminFeed = await call('GET', '/api/admin/comments', { cookie: admin.cookie });
  assert.equal(adminFeed.status, 200);
  assert.equal(adminFeed.data.length, 5);
  const target = adminFeed.data[0];
  assert.ok(target.author_email.includes('@'));
  const hidden = await call('PATCH', `/api/admin/comments/${target.id}`, { cookie: admin.cookie, body: { status: 'hidden' } });
  assert.equal(hidden.data.status, 'hidden');
  assert.ok(!(await call('GET', '/api/comments')).data.some((comment) => comment.id === target.id));
  const published = await call('PATCH', `/api/admin/comments/${target.id}`, { cookie: admin.cookie, body: { status: 'published' } });
  assert.equal(published.data.status, 'published');
  assert.equal((await call('DELETE', `/api/admin/comments/${target.id}`, { cookie: admin.cookie })).status, 200);
  assert.equal((await call('GET', '/api/comments')).data.length, 4);
});

test('admin guards and management flows', async () => {
  const { call } = await harness();
  const client = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  assert.equal((await call('GET', '/api/admin/stats', { cookie: client.cookie })).status, 403);

  const admin = await call('POST', '/api/login', { body: { email: 'admin@aura-kids.ru', password: 'Aura-Admin-2026' } });
  assert.equal(admin.status, 200);
  const stats = await call('GET', '/api/admin/stats', { cookie: admin.cookie });
  assert.equal(stats.status, 200);
  assert.equal(stats.data.total, 7);
  assert.equal(stats.data.days.length, 14);
  assert.equal(stats.data.revenue, null, 'revenue is owner-only');

  const list = await call('GET', '/api/admin/bookings', { cookie: admin.cookie });
  const pending = list.data.find((booking) => booking.status === 'pending');
  const confirmed = await call('PATCH', `/api/admin/bookings/${pending.id}`, { cookie: admin.cookie, body: { status: 'confirmed' } });
  assert.equal(confirmed.status, 200);
  const completed = await call('PATCH', `/api/admin/bookings/${pending.id}`, { cookie: admin.cookie, body: { status: 'completed' } });
  assert.equal(completed.status, 200);
  const invalid = await call('PATCH', `/api/admin/bookings/${pending.id}`, { cookie: admin.cookie, body: { status: 'confirmed' } });
  assert.equal(invalid.status, 409);
  const badTarget = await call('PATCH', `/api/admin/bookings/${pending.id}`, { cookie: admin.cookie, body: { status: 'pending' } });
  assert.equal(badTarget.status, 400);

  const owner = await call('POST', '/api/login', { body: { email: 'owner@aura-kids.kz', password: 'Aura-Owner-2026' } });
  assert.equal(owner.status, 200);
  const ownerBookingWrite = await call('PATCH', `/api/admin/bookings/${pending.id}`, { cookie: owner.cookie, body: { status: 'cancelled' } });
  assert.equal(ownerBookingWrite.status, 403, 'owner observes bookings without changing them');

  const adminServiceWrite = await call('POST', '/api/admin/services', {
    cookie: admin.cookie,
    body: {
      title: 'Тестовая программа', category: 'Ванны и сказки', description: 'Описание тестовой программы для проверки.',
      title_kk: 'Сынақ бағдарламасы', title_en: 'Test program',
      description_kk: 'Тексеруге арналған сынақ бағдарламасының сипаттамасы.',
      description_en: 'A test program description used for route checks.',
      duration_min: 60, price: 5000, image: 'k-bubbles', popular: false, active: true, sort_order: 10,
    },
  });
  assert.equal(adminServiceWrite.status, 201, 'admin manages the catalog');
  assert.equal(adminServiceWrite.data.title_en, 'Test program');
  assert.equal(adminServiceWrite.data.title_kk, 'Сынақ бағдарламасы');
  const ownerServiceWrite = await call('POST', '/api/admin/services', {
    cookie: owner.cookie,
    body: {
      title: 'Только просмотр', category: 'Ванны и сказки', description: 'Владелец не должен создавать программы.',
      duration_min: 30, price: 1000, image: 'k-bubbles', popular: false, active: true, sort_order: 11,
    },
  });
  assert.equal(ownerServiceWrite.status, 403, 'owner does not write the catalog');

  const badTranslation = await call('POST', '/api/admin/services', {
    cookie: admin.cookie,
    body: { title: 'Ещё программа', category: 'Ванны и сказки', description: 'Описание ещё одной программы.', title_en: 'No', duration_min: 30, price: 1000, image: 'k-bubbles', popular: false, active: true, sort_order: 11 },
  });
  assert.equal(badTranslation.status, 400);
  const patched = await call('PATCH', `/api/admin/services/${adminServiceWrite.data.id}`, { cookie: admin.cookie, body: { price: 5500, active: false, title_kk: '' } });
  assert.equal(patched.data.price, 5500);
  assert.equal(patched.data.active, false);
  assert.equal(patched.data.title_kk, null);
  assert.equal(patched.data.title_en, 'Test program');
  const ownerServicePatch = await call('PATCH', `/api/admin/services/${adminServiceWrite.data.id}`, { cookie: owner.cookie, body: { price: 1 } });
  assert.equal(ownerServicePatch.status, 403, 'owner cannot patch programs');
  const publicCatalog = await call('GET', '/api/services');
  assert.ok(!publicCatalog.data.some((service) => service.id === adminServiceWrite.data.id));
  const deleted = await call('DELETE', `/api/admin/services/${adminServiceWrite.data.id}`, { cookie: admin.cookie });
  assert.equal(deleted.status, 200);
  const inUse = await call('DELETE', `/api/admin/services/${SERVICE_IDS.milk}`, { cookie: admin.cookie });
  assert.equal(inUse.status, 409);

  const adminComments = await call('GET', '/api/admin/comments', { cookie: admin.cookie });
  const aComment = adminComments.data[0];
  const ownerHide = await call('PATCH', `/api/admin/comments/${aComment.id}`, { cookie: owner.cookie, body: { status: 'hidden' } });
  assert.equal(ownerHide.status, 403, 'owner cannot moderate reviews');
  const ownerDelete = await call('DELETE', `/api/comments/${aComment.id}`, { cookie: owner.cookie });
  assert.equal(ownerDelete.status, 403, 'owner cannot delete other parents reviews');

  const publicFeed = await call('GET', '/api/comments');
  const replyTarget = publicFeed.data[0];
  const clientReply = await call('PATCH', `/api/admin/comments/${replyTarget.id}/reply`, { cookie: client.cookie, body: { reply: 'Родитель не отвечает от лица студии.' } });
  assert.equal(clientReply.status, 403, 'parents cannot answer reviews');
  assert.equal((await call('PATCH', `/api/admin/comments/${replyTarget.id}/reply`, { cookie: owner.cookie, body: { reply: 'ok' } })).status, 400);
  assert.equal((await call('PATCH', '/api/admin/comments/90000000-0000-4000-8000-000000000000/reply', { cookie: owner.cookie, body: { reply: 'Ответ на исчезнувший отзыв.' } })).status, 404);
  const ownerReply = await call('PATCH', `/api/admin/comments/${replyTarget.id}/reply`, { cookie: owner.cookie, body: { reply: 'Спасибо за тёплые слова! Ждём вас снова.' } });
  assert.equal(ownerReply.status, 200);
  assert.equal(ownerReply.data.reply_body, 'Спасибо за тёплые слова! Ждём вас снова.');
  assert.equal(ownerReply.data.reply_author, 'Владелец AURA kids');
  assert.equal((await call('GET', '/api/comments', { cookie: owner.cookie })).data.find((comment) => comment.id === replyTarget.id).reply_body, 'Спасибо за тёплые слова! Ждём вас снова.');
  const adminReply = await call('PATCH', `/api/admin/comments/${replyTarget.id}/reply`, { cookie: admin.cookie, body: { reply: 'Админ тоже может ответить.' } });
  assert.equal(adminReply.status, 200);
  assert.equal(adminReply.data.reply_author, 'Администратор AURA kids');
  const removedReply = await call('PATCH', `/api/admin/comments/${replyTarget.id}/reply`, { cookie: owner.cookie, body: { reply: '' } });
  assert.equal(removedReply.status, 200);
  assert.equal(removedReply.data.reply_body, null);
  assert.equal((await call('GET', '/api/comments')).data.find((comment) => comment.id === replyTarget.id).reply_body, null);
  const ownerStatusAfterReply = await call('PATCH', `/api/admin/comments/${replyTarget.id}`, { cookie: owner.cookie, body: { status: 'hidden' } });
  assert.equal(ownerStatusAfterReply.status, 403, 'replying does not unlock moderation');

  const users = await call('GET', '/api/admin/users', { cookie: admin.cookie });
  assert.equal(users.status, 200);
  assert.equal(users.data.find((user) => user.email === 'anna.smirnova@example.com').bookings_count, 3);
  assert.equal(users.data.find((user) => user.email === 'anna.smirnova@example.com').spent, null, 'spend totals are owner-only');
  const ownerUsers = await call('GET', '/api/admin/users', { cookie: owner.cookie });
  assert.equal(ownerUsers.status, 200);
  assert.ok(ownerUsers.data.every((user) => typeof user.spent === 'number'), 'owner sees spend totals for everyone');
});

test('roles: admin changes roles, owner observes and guards hold', async () => {
  const { call } = await harness();
  const owner = await call('POST', '/api/login', { body: { email: 'owner@aura-kids.kz', password: 'Aura-Owner-2026' } });
  assert.equal(owner.status, 200);
  assert.equal(owner.data.user.role, 'owner');
  const ownerStats = await call('GET', '/api/admin/stats', { cookie: owner.cookie });
  assert.equal(ownerStats.status, 200);
  assert.equal(ownerStats.data.revenue, 7500, 'owner sees revenue');

  const admin = await call('POST', '/api/login', { body: { email: 'admin@aura-kids.ru', password: 'Aura-Admin-2026' } });
  assert.equal((await call('GET', '/api/admin/stats', { cookie: admin.cookie })).data.revenue, null);
  assert.equal((await call('GET', '/api/admin/stats', { cookie: admin.cookie })).status, 200);
  const anna = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  const annaId = anna.data.user.id;

  assert.equal((await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: owner.cookie, body: { role: 'admin' } })).status, 403, 'owner is read-only');
  assert.equal((await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: anna.cookie, body: { role: 'admin' } })).status, 403);
  assert.equal((await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: admin.cookie, body: { role: 'root' } })).status, 400);
  assert.equal((await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: admin.cookie, body: { role: 'owner' } })).status, 400, 'admins cannot mint owners');
  assert.equal((await call('PATCH', '/api/admin/users/90000000-0000-4000-8000-000000000000/role', { cookie: admin.cookie, body: { role: 'admin' } })).status, 404);

  const self = await call('PATCH', `/api/admin/users/${admin.data.user.id}/role`, { cookie: admin.cookie, body: { role: 'client' } });
  assert.equal(self.status, 409);
  assert.equal(self.data.error, 'role_self_change');

  const ownerRole = await call('PATCH', `/api/admin/users/${owner.data.user.id}/role`, { cookie: admin.cookie, body: { role: 'client' } });
  assert.equal(ownerRole.status, 403);
  assert.equal(ownerRole.data.error, 'role_owner_locked');

  const promoted = await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: admin.cookie, body: { role: 'admin' } });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.data.role, 'admin');
  assert.equal((await call('GET', '/api/me', { cookie: anna.cookie })).data.user.role, 'admin');
  assert.equal((await call('GET', '/api/admin/stats', { cookie: anna.cookie })).status, 200);
  assert.equal((await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: anna.cookie, body: { role: 'client' } })).status, 409);

  const demoted = await call('PATCH', `/api/admin/users/${annaId}/role`, { cookie: admin.cookie, body: { role: 'client' } });
  assert.equal(demoted.status, 200);
  assert.equal(demoted.data.role, 'client');
  assert.equal((await call('GET', '/api/admin/stats', { cookie: anna.cookie })).status, 403);

  const list = await call('GET', '/api/admin/users', { cookie: admin.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.data.filter((user) => user.role === 'owner').length, 1);
  const ownerList = await call('GET', '/api/admin/users', { cookie: owner.cookie });
  assert.equal(ownerList.data.find((user) => user.id === annaId).spent, 2900, 'owner sees spend totals');
});

test('profile update and password change rotate sessions', async () => {
  const { call } = await harness();
  const login = await call('POST', '/api/login', { body: { email: 'elena.v@example.com', password: 'GuestDemo-2026' } });
  const patched = await call('PATCH', '/api/me', { cookie: login.cookie, body: { name: 'Елена В.', phone: '+7 926 000-00-00' } });
  assert.equal(patched.data.user.name, 'Елена В.');
  const changed = await call('POST', '/api/password', { cookie: login.cookie, body: { current: 'GuestDemo-2026', password: 'New-Password-2026' } });
  assert.equal(changed.status, 200);
  assert.ok(changed.cookie);
  assert.equal((await call('GET', '/api/me', { cookie: login.cookie })).status, 401);
  assert.equal((await call('GET', '/api/me', { cookie: changed.cookie })).status, 200);
  const oldLogin = await call('POST', '/api/login', { body: { email: 'elena.v@example.com', password: 'GuestDemo-2026' } });
  assert.equal(oldLogin.status, 401);
});

test('public showcase and guest requests', async () => {
  const { call } = await harness();
  const gallery = await call('GET', '/api/gallery');
  assert.equal(gallery.status, 200);
  assert.equal(gallery.data.length, 5);
  assert.ok(gallery.data.every((item) => item.active === undefined && item.created_at === undefined));
  assert.deepEqual(gallery.data.map((item) => item.sort_order), [1, 2, 3, 4, 5]);
  assert.equal(gallery.data[0].title_en, 'Cloud bath');

  const created = await call('POST', '/api/orders', {
    body: {
      name: 'Мария Гость', phone: '+7 705 111-22-33',
      participants: [{ name: 'Лев', age: 4 }, { name: 'Мия', age: 3 }],
      service_id: SERVICE_IDS.milk, comment: 'Хотим утреннее время',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'new');
  assert.equal(created.data.service_title, 'Молочная ванна с облаками');
  assert.equal(created.data.comment, undefined, 'the public response stays minimal');

  const noProgram = await call('POST', '/api/orders', { body: { name: 'Пётр Гость', phone: '+7 705 222-33-44', participants: [{ name: 'Соня', age: 6 }] } });
  assert.equal(noProgram.status, 201);
  assert.equal(noProgram.data.service_title, null);

  assert.equal((await call('POST', '/api/orders', { body: { name: 'X', phone: '+7 705 333-44-55', participants: [{ name: 'Соня', age: 6 }] } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { body: { name: 'Гость Тест', phone: '12', participants: [{ name: 'Соня', age: 6 }] } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { body: { name: 'Гость Тест', phone: '+7 705 333-44-55' } })).status, 400, 'participants are required');
  assert.equal((await call('POST', '/api/orders', {
    body: { name: 'Гость Тест', phone: '+7 705 333-44-55', participants: [{ name: 'X', age: 6 }] },
  })).status, 400);
  assert.equal((await call('POST', '/api/orders', {
    body: { name: 'Гость Тест', phone: '+7 705 333-44-55', participants: [{ name: 'Соня', age: 0 }] },
  })).status, 400);
  assert.equal((await call('POST', '/api/orders', {
    body: {
      name: 'Гость Тест', phone: '+7 705 333-44-55',
      participants: Array.from({ length: 7 }, (_, index) => ({ name: `Гость ${index}`, age: 5 })),
    },
  })).status, 400, 'a request holds at most six children');
  assert.equal((await call('POST', '/api/orders', {
    body: { name: 'Гость Тест', phone: '+7 705 444-55-66', participants: [{ name: 'Соня', age: 6 }], service_id: '90000000-0000-4000-8000-000000000000' },
  })).status, 404);
  assert.equal((await call('GET', '/api/orders')).status, 401, 'my requests need an account');
});

test('staff manage showcase and requests, clients are denied', async () => {
  const { call } = await harness();
  const guestOrder = await call('POST', '/api/orders', {
    body: { name: 'Гость Заявкин', phone: '+7 700 123-45-67', participants: [{ name: 'Соня', age: 6 }, { name: 'Лев', age: 4 }] },
  });
  assert.equal(guestOrder.status, 201);

  const anna = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  assert.equal((await call('GET', '/api/admin/gallery', { cookie: anna.cookie })).status, 403);
  assert.equal((await call('GET', '/api/admin/orders', { cookie: anna.cookie })).status, 403);
  assert.equal((await call('POST', '/api/admin/gallery', {
    cookie: anna.cookie,
    body: { title: 'Чужой кадр', description: 'Родитель не должен управлять витриной.', image: 'k-ritual', active: true, sort_order: 9 },
  })).status, 403);

  const owner = await call('POST', '/api/login', { body: { email: 'owner@aura-kids.kz', password: 'Aura-Owner-2026' } });
  const admin = await call('POST', '/api/login', { body: { email: 'admin@aura-kids.ru', password: 'Aura-Admin-2026' } });
  const ownerGallery = await call('GET', '/api/admin/gallery', { cookie: owner.cookie });
  assert.equal(ownerGallery.status, 200);
  assert.equal(ownerGallery.data.length, 5);
  assert.ok(ownerGallery.data.every((item) => typeof item.active === 'boolean'));

  const created = await call('POST', '/api/admin/gallery', {
    cookie: owner.cookie,
    body: { title: 'Новый кадр', description: 'Описание нового кадра витрины для проверки.', image: 'k-ritual', active: true, sort_order: 6 },
  });
  assert.equal(created.status, 201, 'owner manages the showcase');
  assert.equal(created.data.title, 'Новый кадр');
  assert.equal((await call('GET', '/api/gallery')).data.length, 6);

  const hidden = await call('PATCH', `/api/admin/gallery/${created.data.id}`, { cookie: admin.cookie, body: { active: false } });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.data.active, false);
  assert.equal((await call('GET', '/api/gallery')).data.length, 5);

  assert.equal((await call('POST', '/api/admin/gallery', {
    cookie: owner.cookie,
    body: { title: 'ok', description: 'Слишком короткое название.', image: 'k-ritual', active: true, sort_order: 6 },
  })).status, 400);
  assert.equal((await call('POST', '/api/admin/gallery', {
    cookie: owner.cookie,
    body: { title: 'Норм кадр', description: 'коротко', image: 'k-ritual', active: true, sort_order: 6 },
  })).status, 400);
  assert.equal((await call('POST', '/api/admin/gallery', {
    cookie: owner.cookie,
    body: { title: 'Норм кадр', description: 'Достаточно длинное описание кадра.', image: 'evil', active: true, sort_order: 6 },
  })).status, 400);
  assert.equal((await call('POST', '/api/admin/gallery', {
    cookie: owner.cookie,
    body: { title: 'Норм кадр', description: 'Достаточно длинное описание кадра.', image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', active: true, sort_order: 6 },
  })).status, 400, 'SVG data URLs are rejected');
  assert.equal((await call('POST', '/api/admin/gallery', {
    cookie: owner.cookie,
    body: { title: 'Норм кадр', description: 'Достаточно длинное описание кадра.', image: `data:image/png;base64,${'A'.repeat(1_500_001)}`, active: true, sort_order: 6 },
  })).status, 400, 'oversized data URLs are rejected');

  const updated = await call('PATCH', `/api/admin/gallery/${created.data.id}`, {
    cookie: owner.cookie,
    body: { title: 'Обновлённый кадр', description: 'Обновлённое описание кадра витрины.' },
  });
  assert.equal(updated.data.title, 'Обновлённый кадр');
  assert.equal((await call('DELETE', `/api/admin/gallery/${created.data.id}`, { cookie: owner.cookie })).status, 200);
  assert.equal((await call('GET', '/api/admin/gallery', { cookie: admin.cookie })).data.length, 5);

  const orders = await call('GET', '/api/admin/orders', { cookie: admin.cookie });
  assert.equal(orders.status, 200);
  const mine = orders.data.find((order) => order.id === guestOrder.data.id);
  assert.ok(mine, 'guest requests reach the panel');
  assert.equal(mine.service_title, null);
  assert.equal(mine.status, 'new');
  assert.deepEqual(mine.participants.map((child) => child.name), ['Соня', 'Лев']);
  assert.equal(mine.user_id, null, 'a guest request is not linked to an account');

  const contacted = await call('PATCH', `/api/admin/orders/${guestOrder.data.id}`, { cookie: owner.cookie, body: { status: 'contacted' } });
  assert.equal(contacted.status, 200);
  assert.equal(contacted.data.status, 'contacted');
  const confirmed = await call('PATCH', `/api/admin/orders/${guestOrder.data.id}`, { cookie: admin.cookie, body: { status: 'confirmed' } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.status, 'confirmed');
  assert.ok(confirmed.data.confirmed_at, 'staff can confirm on the phone');
  const done = await call('PATCH', `/api/admin/orders/${guestOrder.data.id}`, { cookie: admin.cookie, body: { status: 'done' } });
  assert.equal(done.status, 200);
  assert.equal(done.data.status, 'done');
  assert.equal((await call('PATCH', `/api/admin/orders/${guestOrder.data.id}`, { cookie: admin.cookie, body: { status: 'contacted' } })).status, 409);
  assert.equal((await call('PATCH', `/api/admin/orders/${guestOrder.data.id}`, { cookie: admin.cookie, body: { status: 'closed' } })).status, 400);
  const seededNew = orders.data.find((order) => order.status === 'new' && order.id !== guestOrder.data.id);
  assert.ok(seededNew);
  assert.equal((await call('PATCH', `/api/admin/orders/${seededNew.id}`, { cookie: owner.cookie, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await call('DELETE', `/api/admin/orders/${guestOrder.data.id}`, { cookie: owner.cookie })).status, 200);
  assert.ok(!(await call('GET', '/api/admin/orders', { cookie: admin.cookie })).data.some((order) => order.id === guestOrder.data.id));

  const stats = await call('GET', '/api/admin/stats', { cookie: admin.cookie });
  assert.deepEqual(stats.data.orders, { total: 3, new: 1 }, 'one seeded request was cancelled, the rest remain');
});

test('a signed-in parent confirms a contacted request', async () => {
  const { call } = await harness();
  const anna = await call('POST', '/api/login', { body: { email: 'anna.smirnova@example.com', password: 'GuestDemo-2026' } });
  assert.equal(anna.status, 200);

  assert.equal((await call('GET', '/api/me', { cookie: anna.cookie })).data.pendingOrders, 1, 'the seeded contacted request awaits confirmation');
  const mine = await call('GET', '/api/orders', { cookie: anna.cookie });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.length, 1);
  const seeded = mine.data[0];
  assert.equal(seeded.status, 'contacted');
  assert.deepEqual(seeded.participants, [{ name: 'Тимур', age: 7 }, { name: 'Милана', age: 4 }]);
  assert.equal(seeded.user_id, undefined, 'the personal list hides the owner id');

  const guestOrder = await call('POST', '/api/orders', {
    body: { name: 'Гость Без Аккаунта', phone: '+7 705 987-65-43', participants: [{ name: 'Ева', age: 5 }] },
  });
  assert.equal(guestOrder.status, 201);
  assert.equal((await call('POST', `/api/orders/${guestOrder.data.id}/confirm`, { cookie: anna.cookie })).status, 404, 'foreign requests stay invisible');

  const created = await call('POST', '/api/orders', {
    cookie: anna.cookie,
    body: { name: 'Анна Смирнова', phone: '+7 916 204-11-87', participants: [{ name: 'Тимур', age: 7 }, { name: 'Милана', age: 4 }] },
  });
  assert.equal(created.status, 201);
  assert.equal((await call('GET', '/api/orders', { cookie: anna.cookie })).data.length, 2, 'a signed-in request is linked automatically');
  assert.equal((await call('POST', `/api/orders/${created.data.id}/confirm`, { cookie: anna.cookie })).status, 409, 'new requests cannot be confirmed yet');

  const confirmed = await call('POST', `/api/orders/${seeded.id}/confirm`, { cookie: anna.cookie });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.status, 'confirmed');
  assert.ok(confirmed.data.confirmed_at);
  assert.equal((await call('POST', `/api/orders/${seeded.id}/confirm`, { cookie: anna.cookie })).status, 409);
  assert.equal((await call('GET', '/api/me', { cookie: anna.cookie })).data.pendingOrders, 0, 'the notification clears after confirming');

  const owner = await call('POST', '/api/login', { body: { email: 'owner@aura-kids.kz', password: 'Aura-Owner-2026' } });
  const panel = await call('GET', '/api/admin/orders', { cookie: owner.cookie });
  const linked = panel.data.find((order) => order.id === seeded.id);
  assert.equal(linked.status, 'confirmed');
  assert.equal(linked.user_id, '20000000-0000-4000-8000-000000000002', 'staff see which account confirmed');
  assert.equal((await call('PATCH', `/api/admin/orders/${seeded.id}`, { cookie: owner.cookie, body: { status: 'done' } })).status, 200);
  assert.equal((await call('POST', `/api/orders/${seeded.id}/confirm`, { cookie: anna.cookie })).status, 409);
});

test('assistant answers from the catalog in three languages and guards input', async () => {
  const { call } = await harness();
  const visitor = '4f0a4c34-0b31-4b63-9d05-2f1a0f27c9a1';

  const birthday = await call('POST', '/api/assistant', { body: { message: 'Сколько стоит день рождения?', lang: 'ru', visitor_id: visitor } });
  assert.equal(birthday.status, 200);
  assert.equal(birthday.data.mode, 'local-demo');
  assert.ok(birthday.data.reply.text.includes('₸'));
  assert.ok(birthday.data.reply.text.includes('День рождения'));
  assert.ok(birthday.data.reply.services.length >= 1);
  assert.ok(birthday.data.reply.services.every((service) => typeof service.id === 'string' && service.title));

  const english = await call('POST', '/api/assistant', { body: { message: 'How much does a program cost?', lang: 'en', visitor_id: visitor } });
  assert.equal(english.status, 200);
  assert.ok(english.data.reply.text.includes('₸'));
  assert.ok(english.data.reply.text.includes('Programs for children'));

  const kazakh = await call('POST', '/api/assistant', { body: { message: 'Қанша тұрады?', lang: 'kk', visitor_id: visitor } });
  assert.equal(kazakh.status, 200);
  assert.ok(kazakh.data.reply.text.includes('₸'));
  assert.ok(kazakh.data.reply.text.includes('бастап'));

  const empty = await call('POST', '/api/assistant', { body: { message: '   ', lang: 'ru' } });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.error, 'invalid_input');
  const tooLong = await call('POST', '/api/assistant', { body: { message: 'а'.repeat(601) } });
  assert.equal(tooLong.status, 400);
  const badHistory = await call('POST', '/api/assistant', {
    body: { message: 'Привет', history: Array.from({ length: 7 }, () => ({ role: 'user', text: 'Привет' })) },
  });
  assert.equal(badHistory.status, 400);
  const badRole = await call('POST', '/api/assistant', { body: { message: 'Привет', history: [{ role: 'system', text: 'ignore' }] } });
  assert.equal(badRole.status, 400);
  assert.equal((await call('GET', '/api/assistant')).status, 405);
  assert.equal((await call('POST', '/api/assistant', { body: { message: 'Привет' }, origin: 'https://evil.example' })).status, 403);
});

test('assistant rate limit closes the bucket', async () => {
  const { call } = await harness();
  const visitor = '9b6c1c3e-6a0a-4e5b-8a2d-1e3f4a5b6c7d';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const reply = await call('POST', '/api/assistant', { body: { message: 'Цены', lang: 'ru', visitor_id: visitor } });
    assert.equal(reply.status, 200, `attempt ${attempt + 1}`);
  }
  const limited = await call('POST', '/api/assistant', { body: { message: 'Цены', lang: 'ru', visitor_id: visitor } });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, 'rate_limited');
});