import { api, errorText } from './api.js';
import { esc, icon, toast, reveal, closeModal, getTheme, setTheme, initTheme } from './ui.js';
import { t, getLang, setLang, LANGS, LANG_NAMES } from './i18n.js';
import { homeView, mountHome } from './views/home.js';
import { servicesView, mountServices } from './views/services.js';
import { authView, mountAuth } from './views/auth.js';
import { bookingView, mountBooking } from './views/booking.js';
import { accountView, mountAccount } from './views/account.js';
import { adminView, mountAdmin } from './views/admin.js';
import { mountAssistant } from './assistant.js';
import { isStaff, isOwner } from './roles.js';
import qrcode from './vendor/qrcode.mjs';

initTheme();

const state = { user: null, services: [], comments: [], gallery: [], next: null, pendingOrders: 0 };
const view = document.getElementById('view');
const header = document.getElementById('site-header');
const footer = document.getElementById('site-footer');
const progress = document.createElement('div');
progress.className = 'scroll-progress';
progress.setAttribute('aria-hidden', 'true');
document.body.append(progress);
const documentTitle = document.title;
let cleanup = null;

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
const firstName = (name) => name.trim().split(/\s+/)[0];
const currentPath = () => location.pathname.replace(/\/+$/, '') || '/';

const NAV = [
  ['/', 'home'],
  ['/services/', 'services'],
  ['/booking/', 'booking'],
  ['/#reviews', 'reviews'],
  ['/#contacts', 'contacts'],
];

function activeNav(path) {
  if (path === '/' && location.hash === '#reviews') return 'reviews';
  if (path === '/' && location.hash === '#contacts') return 'contacts';
  return NAV.find(([href]) => (href.replace(/\/+$/, '') || '/') === path)?.[1] ?? '';
}

function navLinks(path, extra = '') {
  const active = activeNav(path);
  return NAV.map(([href, key]) => `<a href="${href}" class="${active === key ? 'active' : ''}">${t(`nav.${key}`)}</a>`).join('') + extra;
}

function themeButton(id, withLabel = false) {
  const dark = getTheme() === 'dark';
  const label = dark ? t('hdr.themeLight') : t('hdr.themeDark');
  return `<button class="icon-btn theme-btn" id="${id}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${dark}">${icon(dark ? 'sun' : 'moon')}${withLabel ? `<span>${esc(label)}</span>` : ''}</button>`;
}

function langSelect(id) {
  return `<label class="lang-wrap" title="${esc(t('hdr.language'))}">
    <span class="sr-only">${esc(t('hdr.language'))}</span>
    ${icon('globe')}
    <select class="lang-select" id="${id}" aria-label="${esc(t('hdr.language'))}">
      ${LANGS.map((lang) => `<option value="${lang}" ${getLang() === lang ? 'selected' : ''}>${LANG_NAMES[lang]}</option>`).join('')}
    </select>
  </label>`;
}

function langChips() {
  return `<div class="lang-chips" role="group" aria-label="${esc(t('hdr.language'))}">
    ${LANGS.map((lang) => `<button type="button" class="lang-chip ${getLang() === lang ? 'active' : ''}" data-lang="${lang}" aria-pressed="${getLang() === lang}">${lang.toUpperCase()}</button>`).join('')}
  </div>`;
}

function renderHeader() {
  const path = currentPath();
  const user = state.user;
  const accountLink = user
    ? `<a class="user-chip" href="/account/" aria-label="${esc(t('hdr.account'))}"><span class="avatar">${esc(initials(user.name))}</span><span>${esc(firstName(user.name))}</span></a>`
    : `<a class="btn btn-ghost btn-sm" href="/login/">${icon('user')} ${t('hdr.signIn')}</a>`;
  const adminLink = isStaff(user)
    ? `<a class="icon-btn" href="/admin/" aria-label="${esc(t('hdr.admin'))}" title="${esc(t('hdr.admin'))}">${icon(isOwner(user) ? 'crown' : 'shield')}</a>`
    : '';
  const pending = user && state.pendingOrders > 0
    ? `<a class="notify-btn" href="/account/#requests" aria-label="${esc(t('hdr.pendingOrders', { n: state.pendingOrders }))}" title="${esc(t('hdr.pendingOrders', { n: state.pendingOrders }))}">${icon('bell')}<span class="notify-count">${state.pendingOrders}</span></a>`
    : '';
  header.innerHTML = `
  <div class="wrap header-in">
    <a class="brand" href="/" aria-label="${esc(t('hdr.brandHome'))}">
      <span class="brand-mark">${icon('bubble')}</span>
      <span class="brand-name">AURA<small>kids spa</small></span>
    </a>
    <nav class="main-nav" aria-label="${esc(t('hdr.mainNav'))}">${navLinks(path)}</nav>
    <div class="header-actions">
      ${pending}${adminLink}${accountLink}
      ${langSelect('lang-select')}
      ${themeButton('theme-toggle')}
      <a class="btn btn-primary btn-sm" href="/booking/">${t('hdr.book')}</a>
      <button class="icon-btn burger" id="burger" aria-label="${esc(t('hdr.openMenu'))}" aria-expanded="false">${icon('menu')}</button>
    </div>
  </div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="${esc(t('hdr.mobileNav'))}">
    ${navLinks(path, user
      ? `<a href="/account/" ${path === '/account' ? 'class="active"' : ''}>${icon('user')} ${t('hdr.account')}</a>${isStaff(user) ? `<a href="/admin/" ${path === '/admin' ? 'class="active"' : ''}>${icon(user.role === 'owner' ? 'crown' : 'shield')} ${t('hdr.admin')}</a>` : ''}`
      : `<a href="/login/">${icon('user')} ${t('hdr.signIn')}</a><a href="/register/">${icon('sparkles')} ${t('auth.create')}</a>`)}
    <div class="mobile-tools">
      ${langChips()}
      ${themeButton('theme-toggle-mobile', true)}
    </div>
    <a href="/booking/" class="btn btn-primary" style="justify-content:center;margin-top:6px">${t('hdr.book')} ${icon('arrowRight')}</a>
  </nav>`;
  header.querySelector('#burger').addEventListener('click', () => {
    const nav = header.querySelector('#mobile-nav');
    const open = nav.classList.toggle('open');
    header.querySelector('#burger').setAttribute('aria-expanded', String(open));
  });
  header.querySelector('#theme-toggle').addEventListener('click', toggleTheme);
  header.querySelector('#theme-toggle-mobile').addEventListener('click', toggleTheme);
  header.querySelector('#lang-select').addEventListener('change', (event) => applyLanguage(event.target.value));
  header.querySelectorAll('.lang-chip').forEach((chip) => {
    chip.addEventListener('click', () => applyLanguage(chip.dataset.lang));
  });
  header.classList.toggle('scrolled', window.scrollY > 12);
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  const label = next === 'dark' ? t('hdr.themeLight') : t('hdr.themeDark');
  header.querySelectorAll('.theme-btn').forEach((button) => {
    button.innerHTML = `${icon(next === 'dark' ? 'sun' : 'moon')}${button.querySelector('span') ? `<span>${esc(label)}</span>` : ''}`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(next === 'dark'));
  });
}

function applyLanguage(lang) {
  if (lang === getLang()) return;
  setLang(lang);
  location.reload();
}

function closeMobileNav() {
  header.querySelector('#mobile-nav')?.classList.remove('open');
  header.querySelector('#burger')?.setAttribute('aria-expanded', 'false');
}

function qrBoxHtml() {
  const url = `${location.origin}/`;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, title: { text: t('foot.qrAlt') } });
  return `
  <div class="qr-box">
    <span class="qr-art">${svg}</span>
    <span class="qr-caption">${t('foot.qrCaption')}</span>
  </div>`;
}

function renderFooter() {
  footer.innerHTML = `
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="brand" href="/"><span class="brand-mark">${icon('bubble')}</span><span class="brand-name">AURA<small>kids spa</small></span></a>
        <p class="footer-about">${t('foot.about')}</p>
      </div>
      <div>
        <h4>${t('foot.navTitle')}</h4>
        <ul>
          <li><a href="/">${t('foot.home')}</a></li>
          <li><a href="/services/">${t('foot.services')}</a></li>
          <li><a href="/booking/">${t('foot.booking')}</a></li>
          <li><a href="/account/">${t('foot.account')}</a></li>
          <li><a href="/register/">${t('foot.register')}</a></li>
        </ul>
      </div>
      <div>
        <h4>${t('foot.programsTitle')}</h4>
        <ul>
          <li><a href="/services/">${t('foot.catBaths')}</a></li>
          <li><a href="/services/">${t('foot.catMassage')}</a></li>
          <li><a href="/services/">${t('foot.catBeauty')}</a></li>
          <li><a href="/services/">${t('foot.catParty')}</a></li>
          <li><a href="/#gallery">${t('foot.gallery')}</a></li>
        </ul>
      </div>
      <div>
        <h4>${t('foot.contactsTitle')}</h4>
        <ul>
          <li class="with-icon">${icon('pin')}<span>${t('foot.address1')}<br>${t('foot.address2')}</span></li>
          <li class="with-icon">${icon('phone')}<a href="tel:+77271234567">+7 727 123-45-67</a></li>
          <li class="with-icon">${icon('mail')}<a href="mailto:hello@aura-kids.kz">hello@aura-kids.kz</a></li>
          <li class="with-icon">${icon('clock')}<span>${t('foot.schedule')}</span></li>
        </ul>
        ${qrBoxHtml()}
      </div>
    </div>
    <div class="footer-bottom">
      <span>${t('foot.copyright')}</span>
      <span>${t('foot.tagline')}</span>
    </div>
  </div>`;
}

function notFoundView() {
  return `
  <header class="page-head"><div class="wrap">
    <nav class="crumbs"><a href="/">${t('nav.home')}</a>${icon('chevronDown')}<span>404</span></nav>
    <h1>${t('ui.nfTitle')}</h1>
    <p>${t('ui.nfText')}</p>
  </div></header>
  <div class="wrap" style="padding-bottom:calc(var(--gap)*2)">
    <div class="panel empty-state">
      <span class="ic">${icon('bubble')}</span>
      <b>${t('ui.nfBackTitle')}</b>
      <p>${t('ui.nfBackText')}</p>
      <div class="hero-cta" style="justify-content:center">
        <a class="btn btn-primary" href="/">${t('ui.backHome')} ${icon('arrowRight')}</a>
        <a class="btn btn-ghost" href="/services/">${t('ui.toPrograms')}</a>
      </div>
    </div>
  </div>`;
}

const META = {
  '/': 'meta.home',
  '/services': 'meta.services',
  '/booking': 'meta.booking',
  '/login': 'meta.login',
  '/register': 'meta.register',
  '/account': 'meta.account',
  '/admin': 'meta.admin',
};

function syncDocumentMeta(path) {
  const key = META[path];
  document.title = getLang() === 'ru' ? documentTitle : key ? t(key) : t('meta.notFound');
  document.documentElement.lang = getLang();
}

function navigate(href, replace = false) {
  if (replace) location.replace(href);
  else location.assign(href);
}

function setUser(user) {
  state.user = user;
  if (!user) state.pendingOrders = 0;
  renderHeader();
  if (user) refreshPending();
}

async function refreshPending() {
  if (!state.user) return;
  try {
    const me = await api('/api/me');
    state.user = me.user ?? state.user;
    const count = Number(me.pendingOrders) || 0;
    if (count !== state.pendingOrders) {
      state.pendingOrders = count;
      renderHeader();
    }
  } catch { /* the session state is checked on the next navigation */ }
}

window.addEventListener('aura:orders-changed', refreshPending);

async function reloadServices() {
  try { state.services = await api('/api/services'); } catch { /* keep the last good catalog */ }
}

function scrollToHash() {
  const hash = location.hash;
  if (/^#[a-z-]+$/i.test(hash)) {
    const target = document.getElementById(hash.slice(1));
    if (target) {
      target.scrollIntoView({ block: 'start' });
      return;
    }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function render() {
  cleanup?.();
  cleanup = null;
  closeModal();
  closeMobileNav();
  const path = currentPath();
  const params = new URLSearchParams(location.search);
  state.next = params.get('next');

  if (path === '/account' && !state.user) { navigate('/login/?next=/account/', true); return; }
  if (path === '/admin') {
    if (!state.user) { navigate('/login/?next=/admin/', true); return; }
    if (!isStaff(state.user)) {
      toast(t('err.forbidden'), 'error');
      navigate('/account/', true);
      return;
    }
  }
  if ((path === '/login' || path === '/register') && state.user) {
    navigate(isStaff(state.user) ? '/admin/' : '/account/', true);
    return;
  }

  const ctx = { params, navigate, setUser, reloadServices };
  let html;
  let mount = null;
  if (path === '/') { html = homeView(state); mount = (root) => mountHome(root, state); }
  else if (path === '/services') { html = servicesView(state); mount = (root) => mountServices(root, state); }
  else if (path === '/booking') { html = bookingView(state, params); mount = (root) => mountBooking(root, state, ctx); }
  else if (path === '/login' || path === '/register') {
    const mode = path === '/register' ? 'register' : 'login';
    html = authView(state, { mode });
    mount = (root) => mountAuth(root, state, { ...ctx, mode });
  } else if (path === '/account') { html = accountView(state); mount = (root) => mountAccount(root, state, ctx); }
  else if (path === '/admin') { html = adminView(state); mount = (root) => mountAdmin(root, state, ctx); }
  else { html = notFoundView(); }

  view.innerHTML = html;
  cleanup = mount?.(view) ?? null;
  renderHeader();
  syncDocumentMeta(path);
  scrollToHash();
  reveal(view);
}

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 12);
  const height = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${height > 0 ? Math.min(1, window.scrollY / height) : 0})`;
}, { passive: true });

async function boot() {
  renderHeader();
  renderFooter();
  mountAssistant();
  const [me, services, comments, gallery] = await Promise.allSettled([
    api('/api/me'), api('/api/services'), api('/api/comments'), api('/api/gallery'),
  ]);
  state.user = me.status === 'fulfilled' ? me.value.user : null;
  state.pendingOrders = me.status === 'fulfilled' ? Number(me.value.pendingOrders) || 0 : 0;
  if (services.status === 'fulfilled') state.services = services.value;
  else toast(errorText(services.reason), 'error');
  if (comments.status === 'fulfilled' && Array.isArray(comments.value)) state.comments = comments.value;
  if (gallery.status === 'fulfilled' && Array.isArray(gallery.value)) state.gallery = gallery.value;
  render();
  setInterval(() => {
    if (state.user && !document.hidden) refreshPending();
  }, 60000);
}

boot();