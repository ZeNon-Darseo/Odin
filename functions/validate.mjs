// Pure input normalization and bounded validation for the kids spa domain.
import { AppError } from './http.mjs';

export const PASSWORD_MIN_CHARS = 8;
export const PASSWORD_MAX_BYTES = 256;
export const CATEGORIES = ['Ванны и сказки', 'Массажи и забота', 'Красота и грим', 'Праздники и программы'];
export const IMAGES = ['k-hero', 'k-bubbles', 'k-choco', 'k-massage', 'k-beauty', 'k-party', 'k-ritual', 'k-cave'];
export const SLOT_GRID = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
export const BOOKING_WINDOW_DAYS = 30;
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function moscowNow(now = Date.now()) {
  return new Date(now + MOSCOW_OFFSET_MS);
}

export function moscowToday(now = Date.now()) {
  return moscowNow(now).toISOString().slice(0, 10);
}

export function canonicalEmail(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_email', 400);
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppError('invalid_email', 400);
  return email;
}

export function validateName(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_name', 400);
  const name = raw.trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 60) throw new AppError('invalid_name', 400);
  return name;
}

export function validatePhone(raw, { required = true } = {}) {
  if (raw == null || raw === '') {
    if (required) throw new AppError('invalid_phone', 400);
    return null;
  }
  if (typeof raw !== 'string') throw new AppError('invalid_phone', 400);
  const phone = raw.trim();
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[0-9\s()-]+$/.test(phone) || digits.length < 10 || digits.length > 15) throw new AppError('invalid_phone', 400);
  return phone;
}

export function validateChildName(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_child_name', 400);
  const name = raw.trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 60) throw new AppError('invalid_child_name', 400);
  return name;
}

export function validateChildAge(raw) {
  if (!Number.isInteger(raw) || raw < 1 || raw > 17) throw new AppError('invalid_child_age', 400);
  return raw;
}

export function validatePassword(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_password', 400);
  if ([...raw].length < PASSWORD_MIN_CHARS) throw new AppError('invalid_password', 400);
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX_BYTES) throw new AppError('invalid_password', 400);
  return raw;
}

export function boundedPassword(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || new TextEncoder().encode(raw).length > PASSWORD_MAX_BYTES) {
    throw new AppError('invalid_input', 400);
  }
  return raw;
}

export function validateComment(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
  const comment = raw.trim();
  if ([...comment].length > 300) throw new AppError('invalid_input', 400);
  return comment || null;
}

export function validateReviewBody(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_review', 400);
  const text = raw.trim();
  const length = [...text].length;
  if (length < 5 || length > 600) throw new AppError('invalid_review', 400);
  return text;
}

export function validateRating(raw) {
  if (!Number.isInteger(raw) || raw < 1 || raw > 5) throw new AppError('invalid_rating', 400);
  return raw;
}

export function validateReplyBody(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
  const text = raw.trim();
  if (!text) return null;
  const length = [...text].length;
  if (length < 3 || length > 600) throw new AppError('invalid_input', 400);
  return text;
}

export function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function validateBookingDate(raw, now = Date.now()) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new AppError('invalid_date', 400);
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new AppError('invalid_date', 400);
  const today = moscowToday(now);
  const max = new Date(Date.parse(`${today}T00:00:00Z`) + BOOKING_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  if (raw < today || raw > max) throw new AppError('date_out_of_range', 400);
  return raw;
}

export function validateSlot(raw, date, now = Date.now()) {
  if (typeof raw !== 'string' || !SLOT_GRID.includes(raw)) throw new AppError('invalid_slot', 400);
  if (date === moscowToday(now)) {
    const hour = moscowNow(now).getUTCHours();
    if (Number(raw.slice(0, 2)) <= hour) throw new AppError('slot_in_past', 400);
  }
  return raw;
}

export const GALLERY_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
export const IMAGE_DATA_URL_LIMIT = 1_500_000;
const IMAGE_DATA_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// Only bundled scene keys or compressed raster data URLs are renderable.
// SVG is deliberately excluded: it can carry script when opened as a document.
export function validateImageSource(raw) {
  if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
  const value = raw.trim();
  if (IMAGES.includes(value)) return value;
  if (value.length > IMAGE_DATA_URL_LIMIT || !IMAGE_DATA_RE.test(value)) throw new AppError('invalid_input', 400);
  return value;
}

export function validateGalleryInput(body, { partial = false } = {}) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);
  if (!partial || has('title')) {
    if (typeof body?.title !== 'string') throw new AppError('invalid_input', 400);
    const title = body.title.trim();
    if ([...title].length < 3 || [...title].length > 80) throw new AppError('invalid_input', 400);
    out.title = title;
  }
  if (!partial || has('description')) {
    if (typeof body?.description !== 'string') throw new AppError('invalid_input', 400);
    const description = body.description.trim();
    if ([...description].length < 10 || [...description].length > 600) throw new AppError('invalid_input', 400);
    out.description = description;
  }
  if (!partial || has('image')) out.image = validateImageSource(body?.image);
  if (!partial || has('active')) {
    if (typeof body?.active !== 'boolean') throw new AppError('invalid_input', 400);
    out.active = body.active;
  }
  if (!partial || has('sort_order')) {
    if (!Number.isInteger(body?.sort_order) || body.sort_order < 0 || body.sort_order > 999) throw new AppError('invalid_input', 400);
    out.sort_order = body.sort_order;
  }
  for (const [key, min, max] of [['title_kk', 3, 80], ['title_en', 3, 80], ['description_kk', 10, 600], ['description_en', 10, 600]]) {
    if (partial && !has(key)) continue;
    const raw = body?.[key];
    if (raw == null || raw === '') { out[key] = null; continue; }
    if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
    const value = raw.trim();
    if (value === '') { out[key] = null; continue; }
    if ([...value].length < min || [...value].length > max) throw new AppError('invalid_input', 400);
    out[key] = value;
  }
  if (partial && Object.keys(out).length === 0) throw new AppError('invalid_input', 400);
  return out;
}

export const ORDER_STATUSES = ['new', 'contacted', 'confirmed', 'done', 'cancelled'];
export const MAX_PARTICIPANTS = 6;
export const PAYMENT_METHODS = ['card', 'cash'];

export function validatePaymentMethod(raw) {
  if (!PAYMENT_METHODS.includes(raw)) throw new AppError('invalid_payment', 400);
  return raw;
}

export function validateOrderStatus(raw) {
  if (!ORDER_STATUSES.includes(raw)) throw new AppError('invalid_input', 400);
  return raw;
}

function validateParticipant(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('invalid_participants', 400);
  const name = validateChildName(raw.name);
  const rawAge = raw.age;
  const age = typeof rawAge === 'string' && /^\d{1,2}$/.test(rawAge.trim()) ? validateChildAge(Number(rawAge)) : validateChildAge(rawAge);
  return { name, age };
}

export function validateParticipants(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_PARTICIPANTS) throw new AppError('invalid_participants', 400);
  return raw.map(validateParticipant);
}

export function validateBookingInput(body) {
  return {
    participants: JSON.stringify(validateParticipants(body?.participants)),
    name: validateName(body?.name),
    phone: validatePhone(body?.phone),
    payment_method: validatePaymentMethod(body?.payment_method),
    comment: validateComment(body?.comment),
  };
}

function validateOrderComment(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
  const comment = raw.trim();
  if ([...comment].length > 600) throw new AppError('invalid_input', 400);
  return comment || null;
}

export function validateOrderInput(body) {
  return {
    name: validateName(body?.name),
    phone: validatePhone(body?.phone),
    participants: JSON.stringify(validateParticipants(body?.participants)),
    comment: validateOrderComment(body?.comment),
  };
}


export function validateServiceInput(body, { partial = false } = {}) {
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body ?? {}, key);
  if (!partial || has('title')) {
    if (typeof body?.title !== 'string') throw new AppError('invalid_input', 400);
    const title = body.title.trim();
    if ([...title].length < 3 || [...title].length > 80) throw new AppError('invalid_input', 400);
    out.title = title;
  }
  if (!partial || has('category')) {
    if (!CATEGORIES.includes(body?.category)) throw new AppError('invalid_input', 400);
    out.category = body.category;
  }
  if (!partial || has('description')) {
    if (typeof body?.description !== 'string') throw new AppError('invalid_input', 400);
    const description = body.description.trim();
    if ([...description].length < 10 || [...description].length > 400) throw new AppError('invalid_input', 400);
    out.description = description;
  }
  if (!partial || has('duration_min')) {
    if (!Number.isInteger(body?.duration_min) || body.duration_min < 15 || body.duration_min > 240) throw new AppError('invalid_input', 400);
    out.duration_min = body.duration_min;
  }
  if (!partial || has('price')) {
    if (!Number.isInteger(body?.price) || body.price < 0 || body.price > 100000) throw new AppError('invalid_input', 400);
    out.price = body.price;
  }
  if (!partial || has('image')) {
    if (!IMAGES.includes(body?.image)) throw new AppError('invalid_input', 400);
    out.image = body.image;
  }
  if (!partial || has('popular')) {
    if (typeof body?.popular !== 'boolean') throw new AppError('invalid_input', 400);
    out.popular = body.popular;
  }
  if (!partial || has('active')) {
    if (typeof body?.active !== 'boolean') throw new AppError('invalid_input', 400);
    out.active = body.active;
  }
  if (!partial || has('sort_order')) {
    if (!Number.isInteger(body?.sort_order) || body.sort_order < 0 || body.sort_order > 999) throw new AppError('invalid_input', 400);
    out.sort_order = body.sort_order;
  }
  for (const [key, min, max] of [['title_kk', 3, 80], ['title_en', 3, 80], ['description_kk', 10, 400], ['description_en', 10, 400]]) {
    if (partial && !has(key)) continue;
    const raw = body?.[key];
    if (raw == null || raw === '') { out[key] = null; continue; }
    if (typeof raw !== 'string') throw new AppError('invalid_input', 400);
    const value = raw.trim();
    if (value === '') { out[key] = null; continue; }
    if ([...value].length < min || [...value].length > max) throw new AppError('invalid_input', 400);
    out[key] = value;
  }
  if (partial && Object.keys(out).length === 0) throw new AppError('invalid_input', 400);
  return out;
}