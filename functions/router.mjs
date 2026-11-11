// Business routes: own accounts/sessions, public catalog and availability,
// owner-scoped bookings with atomic slot claims, and role-guarded administration.
// Identity comes only from this app's session digest lookup — never from ctx.user,
// Host headers or client-supplied owner fields.
import { AppError, applicationPath, errorJson, json, readJson, requireTrustedOrigin, rows } from './http.mjs';
import {
  canonicalEmail, validateName, validatePhone, validatePassword, boundedPassword, validateComment,
  validateReviewBody, validateRating, validateReplyBody,
  isUuid, validateBookingDate, validateSlot, validateServiceInput, validateBookingInput, moscowToday, SLOT_GRID,
  validateGalleryInput, validateOrderInput, validateOrderStatus, GALLERY_BODY_LIMIT_BYTES,
} from './validate.mjs';
import { hashPassword, verifyPassword, verifyPasswordAgainstDummy } from './passwords.mjs';
import { SESSION_TTL_MS, clearSessionCookie, createSession, revokeSession, sessionCookie, validateSession } from './sessions.mjs';
import { consume } from './limiter.mjs';
import { ASSISTANT_MODE, composeAnswer, normalizeLang } from './assistant.mjs';

const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const retryAfter = (result) => ({ 'retry-after': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) });

class SessionRequired extends Error {
  constructor(state) {
    super('login_required');
    this.state = state;
  }
}

function unauthorized(state) {
  return state === 'invalid'
    ? errorJson('login_required', 401, { 'set-cookie': clearSessionCookie() })
    : errorJson('login_required', 401);
}

async function requireSession(db, request) {
  const result = await validateSession(db, request);
  if (result.state !== 'valid') throw new SessionRequired(result.state);
  return result.session;
}

async function loadUser(db, userId) {
  const found = rows(await db.from('users').select('id,email,name,phone,role').eq('id', userId).limit(1));
  if (found.length !== 1 || typeof found[0]?.email !== 'string') throw new SessionRequired('invalid');
  return found[0];
}

const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name, phone: user.phone ?? null, role: user.role });

const STAFF_ROLES = ['admin', 'owner'];
const ASSIGNABLE_ROLES = ['client', 'admin'];
const isStaff = (user) => STAFF_ROLES.includes(user.role);
const GALLERY_COLUMNS = 'id,title,title_kk,title_en,description,description_kk,description_en,image,active,sort_order,created_at';
const ORDER_FLOW = {
  new: ['contacted', 'cancelled'],
  contacted: ['confirmed', 'cancelled'],
  confirmed: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

function parseParticipants(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function requireStaff(db, request) {
  const session = await requireSession(db, request);
  const user = await loadUser(db, session.userId);
  if (!isStaff(user)) throw new AppError('forbidden', 403);
  return { session, user };
}

// The owner observes the studio, the admin operates it: every mutation below
// goes through requireAdmin, while reads stay open to both staff roles.
async function requireAdmin(db, request) {
  const session = await requireSession(db, request);
  const user = await loadUser(db, session.userId);
  if (user.role !== 'admin') throw new AppError('forbidden', 403);
  return { session, user };
}

async function register(db, request) {
  const body = await readJson(request);
  const email = canonicalEmail(body?.email);
  const name = validateName(body?.name);
  const phone = validatePhone(body?.phone, { required: false });
  const password = validatePassword(body?.password);
  const limit = await consume(db, 'register', email);
  if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));

  const existing = rows(await db.from('users').select('id').eq('email', email).limit(1));
  if (existing.length > 0) return errorJson('email_taken', 409);

  const derived = await hashPassword(password);
  const id = crypto.randomUUID();
  const created = rows(await db.from('users').insertIfAbsent({
    id, email, name, phone,
    password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations,
    role: 'client', created_at: new Date().toISOString(),
  }, { onConflict: 'email' }).select('id,email,name,phone,role'));

  if (created.length !== 1) {
    const winner = rows(await db.from('users').select('id').eq('email', email).limit(1));
    if (winner.length === 1) return errorJson('email_taken', 409);
    return errorJson('registration_unconfirmed', 503);
  }

  const { token } = await createSession(db, id);
  return json({ user: publicUser(created[0]) }, 201, { 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function login(db, request) {
  const body = await readJson(request);
  const email = canonicalEmail(body?.email);
  const limit = await consume(db, 'login', email);
  if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));

  const password = boundedPassword(body?.password);
  const found = rows(await db.from('users')
    .select('id,email,name,phone,role,password_salt,password_hash,password_iterations').eq('email', email).limit(1));

  if (found.length !== 1) {
    await verifyPasswordAgainstDummy(password);
    return errorJson('invalid_credentials', 401);
  }
  const user = found[0];
  const ok = await verifyPassword(password, {
    salt: user.password_salt, hash: user.password_hash, iterations: user.password_iterations,
  });
  if (!ok) return errorJson('invalid_credentials', 401);

  const { token } = await createSession(db, user.id);
  return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function logout(db, request) {
  const result = await validateSession(db, request);
  if (result.state === 'valid' && result.session) {
    try {
      await revokeSession(db, result.session.digest);
    } catch {
      return errorJson('logout_unconfirmed', 503);
    }
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

async function changePassword(db, request, session) {
  const body = await readJson(request);
  const current = boundedPassword(body?.current);
  const next = validatePassword(body?.password);
  const found = rows(await db.from('users').select('id,password_salt,password_hash,password_iterations').eq('id', session.userId).limit(1));
  if (found.length !== 1) throw new SessionRequired('invalid');
  const ok = await verifyPassword(current, {
    salt: found[0].password_salt, hash: found[0].password_hash, iterations: found[0].password_iterations,
  });
  if (!ok) return errorJson('invalid_credentials', 401);

  const derived = await hashPassword(next);
  const updated = rows(await db.from('users').update({
    password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations,
  }).eq('id', session.userId).select('id'));
  if (updated.length !== 1) return errorJson('password_unconfirmed', 503);

  // The hash changed: retire every existing session and issue a fresh one.
  try {
    rows(await db.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', session.userId).select('token_digest'));
    const { token } = await createSession(db, session.userId);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL_SECONDS) });
  } catch {
    return errorJson('session_refresh_failed', 503);
  }
}

async function serviceMap(db) {
  const list = rows(await db.from('services').select('id,title,title_kk,title_en,category,description,description_kk,description_en,duration_min,price,image,popular,active,sort_order').limit(100));
  return new Map(list.map((service) => [service.id, service]));
}

function assistantMessage(value) {
  if (typeof value !== 'string') throw new AppError('invalid_input', 400);
  const text = value.trim().replace(/\s+/g, ' ');
  const length = [...text].length;
  if (length < 1 || length > 600) throw new AppError('invalid_input', 400);
  return text;
}

function assistantHistory(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 6) throw new AppError('invalid_input', 400);
  return value.map((item) => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string') {
      throw new AppError('invalid_input', 400);
    }
    const text = item.text.trim().replace(/\s+/g, ' ');
    if (text === '' || [...text].length > 600) throw new AppError('invalid_input', 400);
    return { role: item.role, text };
  });
}

// The responder is a local knowledge engine until the Qoder Cloud Agent
// capability is enabled; both paths share this same-origin contract.
async function assistantReply(db, request) {
  const body = await readJson(request);
  const message = assistantMessage(body?.message);
  const lang = normalizeLang(body?.lang);
  const history = assistantHistory(body?.history);
  const visitorId = isUuid(body?.visitor_id) ? body.visitor_id : null;

  let subject = 'guest:anonymous';
  try {
    const session = await validateSession(db, request);
    if (session.state === 'valid' && session.session) subject = session.session.userId;
    else if (visitorId) subject = `guest:${visitorId}`;
  } catch {
    if (visitorId) subject = `guest:${visitorId}`;
  }

  const limit = await consume(db, 'assistant', subject);
  if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));

  const services = [...(await serviceMap(db)).values()].filter((service) => service.active);
  const reply = composeAnswer({ message, lang, history, services });
  return json({
    mode: ASSISTANT_MODE,
    reply: {
      text: reply.text,
      services: reply.services.map(({ id, title, title_kk, title_en, category, description, description_kk, description_en, duration_min, price, image, popular }) =>
        ({ id, title, title_kk, title_en, category, description, description_kk, description_en, duration_min, price, image, popular })),
    },
  });
}

async function createBooking(db, request, session) {
  const limit = await consume(db, 'booking', session.userId);
  if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));
  const body = await readJson(request);
  if (!isUuid(body?.service_id)) throw new AppError('invalid_input', 400);
  const date = validateBookingDate(body?.date);
  const slot = validateSlot(body?.slot, date);
  const bookingInput = validateBookingInput(body);

  const services = await serviceMap(db);
  const service = services.get(body.service_id);
  if (!service || !service.active) throw new AppError('not_found', 404);

  const taken = rows(await db.from('slot_holds').select('booking_id')
    .eq('service_id', service.id).eq('booking_date', date).eq('slot', slot).limit(1));
  if (taken.length > 0) return errorJson('slot_taken', 409);

  const id = crypto.randomUUID();
  const created = rows(await db.from('bookings').insert({
    id, user_id: session.userId, service_id: service.id, booking_date: date, slot,
    status: 'pending', participants: bookingInput.participants, payment_method: bookingInput.payment_method,
    client_name: bookingInput.name, client_phone: bookingInput.phone, comment: bookingInput.comment,
    price: service.price, created_at: new Date().toISOString(),
  }).select('id,booking_date,slot,status,price,participants,payment_method'));
  if (created.length !== 1) return errorJson('booking_unconfirmed', 503);

  // The composite primary key is the atomic arbiter under concurrent requests.
  const held = rows(await db.from('slot_holds').insertIfAbsent({
    service_id: service.id, booking_date: date, slot, booking_id: id,
  }, { onConflict: 'service_id,booking_date,slot' }).select('booking_id'));
  if (held.length !== 1) {
    // Lost the race: remove our unheld row so no phantom booking survives.
    try { await db.from('bookings').delete().eq('id', id).select('id'); } catch { /* admin reconciles */ }
    return errorJson('slot_taken', 409);
  }
  return json({
    ...created[0], participants: parseParticipants(created[0].participants),
    service_title: service.title, service_image: service.image, duration_min: service.duration_min,
  }, 201);
}

async function cancelBooking(db, request, session, id) {
  const found = rows(await db.from('bookings').select('id,user_id,service_id,booking_date,slot,status')
    .eq('id', id).eq('user_id', session.userId).limit(1));
  if (found.length !== 1) throw new AppError('not_found', 404);
  const booking = found[0];
  if (!['pending', 'confirmed'].includes(booking.status)) throw new AppError('invalid_status', 409);
  if (booking.booking_date < moscowToday()) throw new AppError('too_late', 409);

  try {
    await db.from('slot_holds').delete().eq('service_id', booking.service_id)
      .eq('booking_date', booking.booking_date).eq('slot', booking.slot).select('booking_id');
  } catch {
    return errorJson('cancel_unconfirmed', 503);
  }
  const updated = rows(await db.from('bookings').update({ status: 'cancelled' })
    .eq('id', id).eq('user_id', session.userId).eq('status', booking.status).select('id,status'));
  if (updated.length !== 1) throw new AppError('write_conflict', 409);
  return json(updated[0]);
}

async function adminSetStatus(db, id, target) {
  if (!['confirmed', 'completed', 'cancelled'].includes(target)) throw new AppError('invalid_input', 400);
  const found = rows(await db.from('bookings').select('id,service_id,booking_date,slot,status').eq('id', id).limit(1));
  if (found.length !== 1) throw new AppError('not_found', 404);
  const booking = found[0];
  const allowed = { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] };
  if (!(allowed[booking.status] ?? []).includes(target)) throw new AppError('invalid_status', 409);

  if (target === 'cancelled') {
    try {
      await db.from('slot_holds').delete().eq('service_id', booking.service_id)
        .eq('booking_date', booking.booking_date).eq('slot', booking.slot).select('booking_id');
    } catch {
      return errorJson('cancel_unconfirmed', 503);
    }
  }
  const updated = rows(await db.from('bookings').update({ status: target })
    .eq('id', id).eq('status', booking.status).select('id,status'));
  if (updated.length !== 1) throw new AppError('write_conflict', 409);
  return json(updated[0]);
}

async function route(db, request, origin) {
  requireTrustedOrigin(request, origin);
  const path = applicationPath(request);
  const method = request.method;

  if (path === '/api/health' && method === 'GET') return json({ ok: true });
  if (path === '/api/register' && method === 'POST') return register(db, request);
  if (path === '/api/login' && method === 'POST') return login(db, request);
  if (path === '/api/logout' && method === 'POST') return logout(db, request);

  if (path === '/api/assistant' && method === 'POST') return assistantReply(db, request);

  if (path === '/api/services' && method === 'GET') {
    const services = [...(await serviceMap(db)).values()]
      .filter((service) => service.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, title, title_kk, title_en, category, description, description_kk, description_en, duration_min, price, image, popular }) =>
        ({ id, title, title_kk, title_en, category, description, description_kk, description_en, duration_min, price, image, popular }));
    return json(services);
  }

  if (path === '/api/gallery' && method === 'GET') {
    const list = rows(await db.from('gallery_items')
      .select('id,title,title_kk,title_en,description,description_kk,description_en,image,sort_order')
      .eq('active', true).order('sort_order', { ascending: true }).limit(60));
    return json(list);
  }

  // Guests can leave a request without an account; the panel turns it into a visit.
  if (path === '/api/orders' && method === 'POST') {
    const body = await readJson(request);
    const fields = validateOrderInput(body);
    const limit = await consume(db, 'order', fields.phone.replace(/\D/g, '') || 'guest');
    if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));

    let serviceId = null;
    let serviceTitle = null;
    if (body?.service_id != null && body.service_id !== '') {
      if (!isUuid(body.service_id)) throw new AppError('invalid_input', 400);
      const service = (await serviceMap(db)).get(body.service_id);
      if (!service || !service.active) throw new AppError('not_found', 404);
      serviceId = service.id;
      serviceTitle = service.title;
    }

    const session = await validateSession(db, request);
    const userId = session.state === 'valid' ? session.session.userId : null;
    const created = rows(await db.from('orders').insert({
      id: crypto.randomUUID(), ...fields, service_id: serviceId, user_id: userId,
      status: 'new', confirmed_at: null, created_at: new Date().toISOString(),
    }).select('id,status,created_at'));
    if (created.length !== 1) return errorJson('order_unconfirmed', 503);
    return json({ ...created[0], service_title: serviceTitle }, 201);
  }

  // A signed-in parent sees their requests and confirms one after the studio
  // marks it "contacted"; guests keep using the phone number from the form.
  if (path === '/api/orders' && method === 'GET') {
    const session = await requireSession(db, request);
    const list = rows(await db.from('orders')
      .select('id,service_id,participants,comment,status,confirmed_at,created_at')
      .eq('user_id', session.userId).order('created_at', { ascending: false }).limit(100));
    const services = await serviceMap(db);
    return json(list.map((order) => ({
      ...order,
      participants: parseParticipants(order.participants),
      service_title: order.service_id ? services.get(order.service_id)?.title ?? null : null,
    })));
  }
  const confirmOrder = path.match(/^\/api\/orders\/([0-9a-f-]{36})\/confirm$/);
  if (confirmOrder && isUuid(confirmOrder[1]) && method === 'POST') {
    const session = await requireSession(db, request);
    const found = rows(await db.from('orders').select('id,status')
      .eq('id', confirmOrder[1]).eq('user_id', session.userId).limit(1));
    if (found.length !== 1) throw new AppError('not_found', 404);
    if (found[0].status !== 'contacted') throw new AppError('invalid_status', 409);
    const confirmedAt = new Date().toISOString();
    const updated = rows(await db.from('orders').update({ status: 'confirmed', confirmed_at: confirmedAt })
      .eq('id', confirmOrder[1]).eq('status', 'contacted').select('id,status,confirmed_at'));
    if (updated.length !== 1) throw new AppError('write_conflict', 409);
    return json(updated[0]);
  }

  if (path === '/api/availability' && method === 'GET') {
    const query = new URL(request.url).searchParams;
    const serviceId = query.get('service_id');
    if (!isUuid(serviceId)) throw new AppError('invalid_input', 400);
    const date = validateBookingDate(query.get('date'));
    const services = await serviceMap(db);
    if (!services.has(serviceId)) throw new AppError('not_found', 404);
    const holds = rows(await db.from('slot_holds').select('slot').eq('service_id', serviceId).eq('booking_date', date).limit(100));
    const booked = new Set(holds.map((hold) => hold.slot));
    const today = moscowToday();
    const currentHour = today === date ? new Date(Date.now() + 3 * 3600000).getUTCHours() : -1;
    return json({
      date,
      slots: SLOT_GRID.map((time) => ({ time, available: !booked.has(time) && Number(time.slice(0, 2)) > currentHour })),
    });
  }

  if (path === '/api/comments' && method === 'GET') {
    const list = rows(await db.from('comments').select('id,service_id,author_name,rating,body,reply_body,replied_at,created_at')
      .eq('status', 'published').order('created_at', { ascending: false }).limit(60));
    const services = await serviceMap(db);
    return json(list.map((comment) => ({
      ...comment,
      service_title: comment.service_id ? services.get(comment.service_id)?.title ?? null : null,
    })));
  }
  if (path === '/api/comments' && method === 'POST') {
    const session = await requireSession(db, request);
    const limit = await consume(db, 'comment', session.userId);
    if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));
    const body = await readJson(request);
    const rating = validateRating(body?.rating);
    const text = validateReviewBody(body?.body);
    let serviceId = null;
    if (body?.service_id != null && body.service_id !== '') {
      if (!isUuid(body.service_id)) throw new AppError('invalid_input', 400);
      serviceId = body.service_id;
    }
    const services = await serviceMap(db);
    if (serviceId && !services.has(serviceId)) throw new AppError('not_found', 404);
    const user = await loadUser(db, session.userId);
    const created = rows(await db.from('comments').insert({
      id: crypto.randomUUID(), user_id: user.id, service_id: serviceId,
      author_name: user.name, rating, body: text, status: 'published',
      created_at: new Date().toISOString(),
    }).select('id,service_id,author_name,rating,body,created_at'));
    if (created.length !== 1) return errorJson('comment_unconfirmed', 503);
    return json({ ...created[0], service_title: serviceId ? services.get(serviceId)?.title ?? null : null }, 201);
  }

  if (path === '/api/me' && method === 'GET') {
    const session = await requireSession(db, request);
    const pending = rows(await db.from('orders').select('id').eq('user_id', session.userId).eq('status', 'contacted').limit(50));
    return json({ user: publicUser(await loadUser(db, session.userId)), pendingOrders: pending.length });
  }
  if (path === '/api/me' && method === 'PATCH') {
    const session = await requireSession(db, request);
    const body = await readJson(request);
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'name')) patch.name = validateName(body.name);
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'phone')) patch.phone = validatePhone(body.phone, { required: false });
    if (Object.keys(patch).length === 0) throw new AppError('invalid_input', 400);
    const updated = rows(await db.from('users').update(patch).eq('id', session.userId).select('id,email,name,phone,role'));
    if (updated.length !== 1) throw new SessionRequired('invalid');
    return json({ user: publicUser(updated[0]) });
  }
  if (path === '/api/password' && method === 'POST') {
    const session = await requireSession(db, request);
    return changePassword(db, request, session);
  }

  if (path === '/api/bookings' && method === 'GET') {
    const session = await requireSession(db, request);
    const list = rows(await db.from('bookings').select('id,service_id,booking_date,slot,status,participants,payment_method,client_name,client_phone,comment,price,created_at')
      .eq('user_id', session.userId).order('created_at', { ascending: false }).limit(100));
    const services = await serviceMap(db);
    return json(list.map((booking) => {
      const service = services.get(booking.service_id);
      return {
        ...booking, participants: parseParticipants(booking.participants),
        service_title: service?.title ?? 'Программа удалена', service_image: service?.image ?? 'k-ritual', duration_min: service?.duration_min ?? 0,
      };
    }));
  }
  if (path === '/api/bookings' && method === 'POST') {
    const session = await requireSession(db, request);
    return createBooking(db, request, session);
  }
  const cancel = path.match(/^\/api\/bookings\/([0-9a-f-]{36})\/cancel$/);
  if (cancel && isUuid(cancel[1]) && method === 'POST') {
    const session = await requireSession(db, request);
    return cancelBooking(db, request, session, cancel[1]);
  }

  const ownComment = path.match(/^\/api\/comments\/([0-9a-f-]{36})$/);
  if (ownComment && isUuid(ownComment[1])) {
    if (method !== 'DELETE') throw new AppError('method_not_allowed', 405);
    const session = await requireSession(db, request);
    const user = await loadUser(db, session.userId);
    const found = rows(await db.from('comments').select('id,user_id').eq('id', ownComment[1]).limit(1));
    if (found.length !== 1) throw new AppError('not_found', 404);
    if (found[0].user_id !== user.id) throw new AppError('forbidden', 403);
    const deleted = rows(await db.from('comments').delete().eq('id', ownComment[1]).select('id'));
    if (deleted.length !== 1) throw new AppError('not_found', 404);
    return json({ ok: true });
  }

  if (path === '/api/admin/stats' && method === 'GET') {
    const { user } = await requireStaff(db, request);
    const owner = user.role === 'owner';
    const bookings = rows(await db.from('bookings').select('id,booking_date,status,price,created_at').limit(1000));
    const users = rows(await db.from('users').select('id,role').limit(1000));
    const orders = rows(await db.from('orders').select('id,status').limit(1000));
    const today = moscowToday();
    const statusCounts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    let revenue = 0;
    let upcoming = 0;
    for (const booking of bookings) {
      if (statusCounts[booking.status] != null) statusCounts[booking.status] += 1;
      if (booking.status === 'completed') revenue += booking.price;
      if (booking.booking_date >= today && ['pending', 'confirmed'].includes(booking.status)) upcoming += 1;
    }
    const days = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);
      days.push({ date: day, count: bookings.filter((booking) => booking.booking_date === day && booking.status !== 'cancelled').length });
    }
    return json({
      total: bookings.length, upcoming, revenue: owner ? revenue : null,
      clients: users.filter((user) => user.role === 'client').length,
      statusCounts, days,
      orders: { total: orders.length, new: orders.filter((order) => order.status === 'new').length },
    });
  }

  if (path === '/api/admin/bookings' && method === 'GET') {
    await requireStaff(db, request);
    const list = rows(await db.from('bookings').select('id,user_id,service_id,booking_date,slot,status,participants,payment_method,client_name,client_phone,comment,price,created_at')
      .order('created_at', { ascending: false }).limit(500));
    const services = await serviceMap(db);
    const users = rows(await db.from('users').select('id,email').limit(1000));
    const emails = new Map(users.map((user) => [user.id, user.email]));
    return json(list.map((booking) => ({
      ...booking,
      participants: parseParticipants(booking.participants),
      service_title: services.get(booking.service_id)?.title ?? 'Программа удалена',
      client_email: emails.get(booking.user_id) ?? '',
    })));
  }
  const adminBooking = path.match(/^\/api\/admin\/bookings\/([0-9a-f-]{36})$/);
  if (adminBooking && isUuid(adminBooking[1]) && method === 'PATCH') {
    await requireAdmin(db, request);
    const body = await readJson(request);
    return adminSetStatus(db, adminBooking[1], body?.status);
  }

  if (path === '/api/admin/comments' && method === 'GET') {
    await requireStaff(db, request);
    const list = rows(await db.from('comments').select('id,user_id,service_id,author_name,rating,body,status,reply_body,reply_by,replied_at,created_at')
      .order('created_at', { ascending: false }).limit(300));
    const services = await serviceMap(db);
    const users = rows(await db.from('users').select('id,email,name').limit(1000));
    const emails = new Map(users.map((user) => [user.id, user.email]));
    const names = new Map(users.map((user) => [user.id, user.name]));
    return json(list.map((comment) => ({
      ...comment,
      service_title: comment.service_id ? services.get(comment.service_id)?.title ?? null : null,
      author_email: emails.get(comment.user_id) ?? '',
      reply_author: comment.reply_by ? names.get(comment.reply_by) ?? null : null,
    })));
  }
  const adminCommentReply = path.match(/^\/api\/admin\/comments\/([0-9a-f-]{36})\/reply$/);
  if (adminCommentReply && isUuid(adminCommentReply[1])) {
    if (method !== 'PATCH') throw new AppError('method_not_allowed', 405);
    // Replies are the owner's way to speak to parents, so any staff member may write them.
    const { user } = await requireStaff(db, request);
    const body = await readJson(request);
    const reply = validateReplyBody(body?.reply);
    const updated = rows(await db.from('comments').update({
      reply_body: reply,
      reply_by: reply ? user.id : null,
      replied_at: reply ? new Date().toISOString() : null,
    }).eq('id', adminCommentReply[1]).select('id,reply_body,reply_by,replied_at'));
    if (updated.length !== 1) throw new AppError('not_found', 404);
    return json({ ...updated[0], reply_author: reply ? user.name : null });
  }
  const adminComment = path.match(/^\/api\/admin\/comments\/([0-9a-f-]{36})$/);
  if (adminComment && isUuid(adminComment[1])) {
    await requireAdmin(db, request);
    if (method === 'PATCH') {
      const body = await readJson(request);
      if (!['published', 'hidden'].includes(body?.status)) throw new AppError('invalid_input', 400);
      const updated = rows(await db.from('comments').update({ status: body.status })
        .eq('id', adminComment[1]).select('id,status'));
      if (updated.length !== 1) throw new AppError('not_found', 404);
      return json(updated[0]);
    }
    if (method === 'DELETE') {
      const deleted = rows(await db.from('comments').delete().eq('id', adminComment[1]).select('id'));
      if (deleted.length !== 1) throw new AppError('not_found', 404);
      return json({ ok: true });
    }
    throw new AppError('method_not_allowed', 405);
  }

  if (path === '/api/admin/services' && method === 'GET') {
    await requireStaff(db, request);
    const list = rows(await db.from('services').select('id,title,title_kk,title_en,category,description,description_kk,description_en,duration_min,price,image,popular,active,sort_order,created_at').limit(100));
    return json(list.sort((a, b) => a.sort_order - b.sort_order));
  }
  if (path === '/api/admin/services' && method === 'POST') {
    await requireAdmin(db, request);
    const body = await readJson(request);
    const fields = validateServiceInput(body);
    const created = rows(await db.from('services').insert({
      id: crypto.randomUUID(), ...fields, created_at: new Date().toISOString(),
    }).select('id,title,title_kk,title_en,category,description,description_kk,description_en,duration_min,price,image,popular,active,sort_order'));
    if (created.length !== 1) return errorJson('service_unconfirmed', 503);
    return json(created[0], 201);
  }
  const adminService = path.match(/^\/api\/admin\/services\/([0-9a-f-]{36})$/);
  if (adminService && isUuid(adminService[1]) && method === 'PATCH') {
    await requireAdmin(db, request);
    const body = await readJson(request);
    const fields = validateServiceInput(body, { partial: true });
    const updated = rows(await db.from('services').update(fields).eq('id', adminService[1])
      .select('id,title,title_kk,title_en,category,description,description_kk,description_en,duration_min,price,image,popular,active,sort_order'));
    if (updated.length !== 1) throw new AppError('not_found', 404);
    return json(updated[0]);
  }
  if (adminService && isUuid(adminService[1]) && method === 'DELETE') {
    await requireAdmin(db, request);
    const used = rows(await db.from('bookings').select('id').eq('service_id', adminService[1]).limit(1));
    if (used.length > 0) return errorJson('service_in_use', 409);
    const deleted = rows(await db.from('services').delete().eq('id', adminService[1]).select('id'));
    if (deleted.length !== 1) throw new AppError('not_found', 404);
    return json({ ok: true });
  }

  // The showcase is studio content, so the owner may publish photos too.
  if (path === '/api/admin/gallery' && method === 'GET') {
    await requireStaff(db, request);
    const list = rows(await db.from('gallery_items').select(GALLERY_COLUMNS)
      .order('sort_order', { ascending: true }).limit(120));
    return json(list);
  }
  if (path === '/api/admin/gallery' && method === 'POST') {
    await requireStaff(db, request);
    const body = await readJson(request, GALLERY_BODY_LIMIT_BYTES);
    const fields = validateGalleryInput(body);
    const created = rows(await db.from('gallery_items').insert({
      id: crypto.randomUUID(), ...fields, created_at: new Date().toISOString(),
    }).select(GALLERY_COLUMNS));
    if (created.length !== 1) return errorJson('gallery_unconfirmed', 503);
    return json(created[0], 201);
  }
  const adminGallery = path.match(/^\/api\/admin\/gallery\/([0-9a-f-]{36})$/);
  if (adminGallery && isUuid(adminGallery[1])) {
    await requireStaff(db, request);
    if (method === 'PATCH') {
      const body = await readJson(request, GALLERY_BODY_LIMIT_BYTES);
      const fields = validateGalleryInput(body, { partial: true });
      const updated = rows(await db.from('gallery_items').update(fields)
        .eq('id', adminGallery[1]).select(GALLERY_COLUMNS));
      if (updated.length !== 1) throw new AppError('not_found', 404);
      return json(updated[0]);
    }
    if (method === 'DELETE') {
      const deleted = rows(await db.from('gallery_items').delete().eq('id', adminGallery[1]).select('id'));
      if (deleted.length !== 1) throw new AppError('not_found', 404);
      return json({ ok: true });
    }
    throw new AppError('method_not_allowed', 405);
  }

  if (path === '/api/admin/orders' && method === 'GET') {
    await requireStaff(db, request);
    const list = rows(await db.from('orders')
      .select('id,user_id,name,phone,participants,service_id,comment,status,confirmed_at,created_at')
      .order('created_at', { ascending: false }).limit(500));
    const services = await serviceMap(db);
    return json(list.map((order) => ({
      ...order,
      participants: parseParticipants(order.participants),
      service_title: order.service_id ? services.get(order.service_id)?.title ?? null : null,
    })));
  }
  const adminOrder = path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/);
  if (adminOrder && isUuid(adminOrder[1])) {
    await requireStaff(db, request);
    if (method === 'PATCH') {
      const body = await readJson(request);
      const target = validateOrderStatus(body?.status);
      const found = rows(await db.from('orders').select('id,status').eq('id', adminOrder[1]).limit(1));
      if (found.length !== 1) throw new AppError('not_found', 404);
      const current = found[0].status;
      if (current === target) return json(found[0]);
      if (!(ORDER_FLOW[current] ?? []).includes(target)) throw new AppError('invalid_status', 409);
      const patch = target === 'confirmed' ? { status: target, confirmed_at: new Date().toISOString() } : { status: target };
      const updated = rows(await db.from('orders').update(patch)
        .eq('id', adminOrder[1]).eq('status', current).select('id,status,confirmed_at'));
      if (updated.length !== 1) throw new AppError('write_conflict', 409);
      return json(updated[0]);
    }
    if (method === 'DELETE') {
      const deleted = rows(await db.from('orders').delete().eq('id', adminOrder[1]).select('id'));
      if (deleted.length !== 1) throw new AppError('not_found', 404);
      return json({ ok: true });
    }
    throw new AppError('method_not_allowed', 405);
  }

  if (path === '/api/admin/users' && method === 'GET') {
    const { user: viewer } = await requireStaff(db, request);
    const owner = viewer.role === 'owner';
    const users = rows(await db.from('users').select('id,email,name,phone,role,created_at').limit(500));
    const bookings = rows(await db.from('bookings').select('user_id,status,price,booking_date').limit(1000));
    return json(users
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((user) => {
        const own = bookings.filter((booking) => booking.user_id === user.id);
        return {
          ...user,
          bookings_count: own.length,
          visits: own.filter((booking) => booking.status === 'completed').length,
          spent: owner ? own.filter((booking) => booking.status === 'completed').reduce((sum, booking) => sum + booking.price, 0) : null,
        };
      }));
  }

  const adminUserRole = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/role$/);
  if (adminUserRole && isUuid(adminUserRole[1])) {
    if (method !== 'PATCH') throw new AppError('method_not_allowed', 405);
    const { user: actor } = await requireAdmin(db, request);
    const body = await readJson(request);
    const role = body?.role;
    if (!ASSIGNABLE_ROLES.includes(role)) throw new AppError('invalid_input', 400);
    if (adminUserRole[1] === actor.id) return errorJson('role_self_change', 409);

    const target = rows(await db.from('users').select('id,email,name,phone,role').eq('id', adminUserRole[1]).limit(1));
    if (target.length !== 1) throw new AppError('not_found', 404);
    if (target[0].role === 'owner') return errorJson('role_owner_locked', 403);
    if (target[0].role === role) return json(publicUser(target[0]));

    const updated = rows(await db.from('users').update({ role })
      .eq('id', adminUserRole[1]).eq('role', target[0].role)
      .select('id,email,name,phone,role'));
    if (updated.length !== 1) return errorJson('write_conflict', 409);
    return json(publicUser(updated[0]));
  }

  const known = ['/api/me', '/api/password', '/api/bookings', '/api/services', '/api/gallery', '/api/orders', '/api/availability', '/api/register', '/api/login', '/api/logout', '/api/health', '/api/comments', '/api/assistant', '/api/admin/stats', '/api/admin/bookings', '/api/admin/services', '/api/admin/gallery', '/api/admin/orders', '/api/admin/users', '/api/admin/comments'];
  if (known.includes(path) || cancel || confirmOrder || ownComment || adminBooking || adminService || adminGallery || adminOrder || adminComment || adminUserRole) throw new AppError('method_not_allowed', 405);
  throw new AppError('not_found', 404);
}

// Dependency injection is for local tests only; ctx supplies the request, never identity.
export function createApplication({ db, origin }) {
  return async function handle(ctx) {
    try {
      return await route(db, ctx.request, typeof origin === 'function' ? origin() : origin);
    } catch (error) {
      if (error instanceof SessionRequired) return unauthorized(error.state);
      if (error instanceof AppError) return errorJson(error.code, error.status);
      return errorJson('service_unavailable', 503);
    }
  };
}