import { fmtPrice, fmtDuration, fmtDate, dayLabel, t } from './i18n.js';

export { fmtPrice, fmtDuration, fmtDate, dayLabel };

export const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const PATHS = {
  bubble: 'M10 3.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm8 9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-7 5.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM10 7l2 2',
  sparkles: 'M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7L12 4Zm7 10l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14ZM5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15Z',
  calendar: 'M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h3m3 0h3m-9 4h3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.2 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c.8-4 3.9-6 8-6s7.2 2 8 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9c.7-3.5 3.3-5.5 7-5.5s6.3 2 7 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8m2.4 3.4c2 .8 3.2 2.5 3.6 5.2',
  phone: 'M5 4h4l1.5 4.5-2.2 1.6a12 12 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1 1 0 0 1-1.1 1C10.5 19.4 4.6 13.5 4 5.1A1 1 0 0 1 5 4Z',
  mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 2l8 6 8-6',
  pin: 'M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  star: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z',
  arrowRight: 'M4 12h15m-6-7l7 7-7 7',
  arrowLeft: 'M20 12H5m6-7l-7 7 7 7',
  check: 'M4.5 12.5l5 5 10-11',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Zm10-13l3 3',
  trash: 'M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13M10 11v6m4-6v6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21',
  chevronDown: 'M6 9l6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4m6-4l4-4-4-4m4 4H10',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3Zm-3.5 9l2.5 2.5 4.5-5',
  crown: 'M4 7l4.5 3.5L12 4l3.5 6.5L20 7l-1.6 11H5.6L4 7Zm1.6 11h12.8M9.5 14.5h5',
  chart: 'M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Zm0 0V6a1 1 0 0 1 1-1h13m1 8h-4a2 2 0 0 0 0 4h4',
  card: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 4h20M6 15h3',
  leaf: 'M5 19C5 9 12 4 20 4c0 9-5 15-13 15m-2 2c2-6 6-10 11-12',
  droplet: 'M12 3s6 6.6 6 11a6 6 0 1 1-12 0c0-4.4 6-11 6-11Z',
  stones: 'M8 10a4 3 0 1 0 0-6 4 3 0 0 0 0 6Zm8 2a4 3 0 1 0 0-6 4 3 0 0 0 0 6Zm-4 8a5 3.5 0 1 0 0-7 5 3.5 0 0 0 0 7Z',
  heart: 'M12 20s-7.5-4.7-9-9c-1-3 1-6 4-6 2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3 0 5 3 4 6-1.5 4.3-9 9-9 9Z',
  eye: 'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'M4 4l16 16M9.9 5.9A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4M6.1 8A16.6 16.6 0 0 0 2 12s3.5 6.5 10 6.5c1.4 0 2.7-.3 3.8-.8M9.9 9.9a2.5 2.5 0 0 0 3.5 3.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v.5m0 3v5',
  telegram: 'M21 4L3 11l6 2.5M21 4l-3 15-9-6.5M21 4L9 13.5V19l3.4-3.2',
  whatsapp: 'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm-3 5.5c-.3 0-.8.1-.8.9 0 2.6 3 5.6 5.6 5.6.8 0 .9-.5.9-.8l-.4-1.2-1.3.4c-1-.4-2-1.4-2.4-2.4l.4-1.3-1.2-.4Z',
  gift: 'M4 10h16v10H4V10Zm-1-4h18v4H3V6Zm9 0v14m0-14c-1.5-3-6-3-6 0m6 0c1.5-3 6-3 6 0',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8l-1.4 1.4m-10 10L5.6 18.4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z',
  inbox: 'M4 13h4l1.2 2.5h5.6L16 13h4M4 13l2.4-7.2A1 1 0 0 1 7.3 5h9.4a1 1 0 0 1 .9.6L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z',
  picture: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 12 5-5 4 4 2-2 5 5M8.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  upload: 'M12 16V4m-5 5 5-5 5 5M5 20h14',
  send: 'M21 3 3 11l7 3 3 7 8-18Zm-11 11 4-4',
  expand: 'M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4.5-9 3 3 6-6',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.3 20a2 2 0 0 0 3.4 0',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name] ?? PATHS.sparkles}"/></svg>`;
}

export const image = (name) => {
  const value = String(name ?? '');
  return value.startsWith('data:image/') || value.startsWith('/') ? value : `/assets/${value}.jpg`;
};

export function nextDays(count = 14) {
  const days = [];
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  for (let offset = 0; offset < count; offset += 1) {
    days.push(new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10));
  }
  return days;
}

export const STATUS_KEYS = ['pending', 'confirmed', 'completed', 'cancelled'];
export const statusLabel = (status) => (STATUS_KEYS.includes(status) ? t(`status.${status}`) : status);
export const statusChip = (status) => `<span class="chip ${STATUS_KEYS.includes(status) ? `st-${status}` : ''}">${esc(statusLabel(status))}</span>`;

export const ORDER_STATUS_KEYS = ['new', 'contacted', 'confirmed', 'done', 'cancelled'];
const ORDER_STATUS_CLASS = { new: 'st-pending', contacted: 'st-confirmed', confirmed: 'st-completed', done: 'st-done', cancelled: 'st-cancelled' };
export const orderStatusLabel = (status) => t(`orderStatus.${ORDER_STATUS_KEYS.includes(status) ? status : 'new'}`);
export const orderStatusChip = (status) => `<span class="chip ${ORDER_STATUS_CLASS[status] ?? ''}">${esc(orderStatusLabel(status))}</span>`;

export const PAYMENT_METHODS = ['card', 'cash'];
export const paymentLabel = (method) => t(`payment.${PAYMENT_METHODS.includes(method) ? method : 'card'}`);
export const paymentIcon = (method) => (method === 'cash' ? 'wallet' : 'card');

const THEME_KEY = 'aura-theme';
export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
export function setTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  try { localStorage.setItem(THEME_KEY, value); } catch { /* storage may be blocked */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#140e1b' : '#fff6fb');
  return value;
}
export function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch { /* storage may be blocked */ }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return setTheme(theme);
}

let toastHost = null;
export function toast(message, type = 'info') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('role', 'status');
    document.body.append(toastHost);
  }
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.innerHTML = `${icon(type === 'success' ? 'check' : type === 'error' ? 'info' : 'sparkles')}<span>${esc(message)}</span>`;
  toastHost.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 400);
  }, 4600);
}

let modalHost = null;
export function openModal({ title, body, footer, wide = false, onClose }) {
  closeModal();
  if (!modalHost) {
    modalHost = document.createElement('div');
    modalHost.className = 'modal-host';
    document.body.append(modalHost);
  }
  modalHost.innerHTML = `
    <div class="modal-scrim" data-close></div>
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="${esc(t('ui.close'))}">${icon('close')}</button></header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </div>`;
  modalHost.classList.add('open');
  document.body.classList.add('no-scroll');
  const close = () => { closeModal(); onClose?.(); };
  modalHost.querySelectorAll('[data-close]').forEach((node) => node.addEventListener('click', close));
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modalHost._onKey = onKey;
  const focusable = modalHost.querySelector('input, select, textarea, button:not([data-close])');
  focusable?.focus();
  return modalHost;
}
export function closeModal() {
  if (!modalHost) return;
  if (modalHost._onKey) document.removeEventListener('keydown', modalHost._onKey);
  modalHost.classList.remove('open');
  modalHost.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
export function confirmDialog({ title, message, confirmLabel = t('ui.confirm'), danger = false }) {
  return new Promise((resolve) => {
    const host = openModal({
      title,
      body: `<p class="modal-text">${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-no>${esc(t('ui.cancel'))}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>`,
      onClose: () => resolve(false),
    });
    host.querySelector('[data-no]').addEventListener('click', () => { closeModal(); resolve(false); });
    host.querySelector('[data-yes]').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

let observer = null;
export function reveal(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.querySelectorAll('[data-reveal]').forEach((node) => node.classList.add('in'));
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  root.querySelectorAll('[data-reveal]:not(.in)').forEach((node) => observer.observe(node));
}

export const debounce = (fn, ms = 250) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

export function countUp(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((node) => {
    const target = Number(node.dataset.count);
    if (!Number.isFinite(target)) return;
    const decimals = Number(node.dataset.decimals || 0);
    const format = (value) => value.toFixed(decimals).replace(/\.0$/, '');
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / 1100);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = format(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else node.textContent = format(target);
    };
    requestAnimationFrame(tick);
  });
}

export function bindPasswordToggles(root) {
  root.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.innerHTML = icon(show ? 'eyeOff' : 'eye');
      button.setAttribute('aria-label', show ? t('auth.hidePassword') : t('auth.showPassword'));
    });
  });
}