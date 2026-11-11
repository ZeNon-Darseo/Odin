// Floating site assistant. The panel is mounted once on boot, keeps its short
// conversation in sessionStorage and talks to the same-origin /api/assistant
// route. The route currently answers from the live catalog (local-demo mode).
import { api } from './api.js';
import { t, getLang, localized, fmtPrice, fmtDuration } from './i18n.js';
import { esc, icon } from './ui.js';

const STORE_KEY = 'aura-assistant-chat';
const VISITOR_KEY = 'aura-visitor-id';
const QUICK_KEYS = ['quickProgram', 'quickPrice', 'quickBirthday', 'quickBooking'];
const MAX_MESSAGES = 40;

let host = null;
let fab = null;
let panel = null;
let log = null;
let input = null;
let form = null;
let quick = null;
let busy = false;
let messages = [];

function isMessage(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.role === 'user') return typeof item.text === 'string' && item.text.trim() !== '';
  if (item.role === 'assistant') {
    if (item.key === 'greeting') return true;
    return typeof item.text === 'string' && item.text.trim() !== '';
  }
  return false;
}

function loadMessages() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage).slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function saveMessages() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES))); } catch { /* storage may be blocked */ }
}

function visitorId() {
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (/^[0-9a-f-]{36}$/i.test(stored ?? '')) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

const textHtml = (value) => esc(value).replaceAll('\n', '<br>');

function cardsHtml(services) {
  if (!Array.isArray(services) || services.length === 0) return '';
  const cards = services
    .filter((service) => service && typeof service.id === 'string')
    .slice(0, 4)
    .map((service) => `
      <a class="assistant-card" href="/booking/?service=${esc(service.id)}">
        <b>${esc(localized(service, 'title'))}</b>
        <span>${esc(fmtPrice(service.price))} · ${esc(fmtDuration(service.duration_min))}</span>
      </a>`)
    .join('');
  return cards ? `<div class="assistant-cards">${cards}</div>` : '';
}

function messageHtml(message) {
  if (message.role === 'user') return `<div class="assistant-msg user">${textHtml(message.text)}</div>`;
  const text = message.key === 'greeting' ? t('assistant.greeting') : message.text;
  return `<div class="assistant-msg bot">${textHtml(text)}${cardsHtml(message.services)}</div>`;
}

function scrollBottom() {
  if (log) log.scrollTop = log.scrollHeight;
}

function renderMessages() {
  if (!log) return;
  log.innerHTML = messages.map(messageHtml).join('');
  scrollBottom();
}

function saveAndRender() {
  saveMessages();
  renderMessages();
}

function showError(message) {
  const node = document.createElement('div');
  node.className = 'assistant-msg error';
  node.textContent = message;
  log.append(node);
  scrollBottom();
}

function seedGreeting() {
  messages = [{ role: 'assistant', key: 'greeting' }];
  saveAndRender();
}

function setBusy(value) {
  busy = value;
  input.disabled = value;
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = value;
  panel?.classList.toggle('is-busy', value);
}

async function send(raw) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 600);
  if (value === '' || busy) return;

  const history = messages
    .filter((message) => message.role === 'user' || (message.role === 'assistant' && typeof message.text === 'string'))
    .slice(-6)
    .map((message) => ({ role: message.role, text: message.text }));

  messages.push({ role: 'user', text: value });
  saveAndRender();
  input.value = '';
  setBusy(true);

  const typing = document.createElement('div');
  typing.className = 'assistant-typing';
  typing.setAttribute('aria-label', t('assistant.typing'));
  typing.innerHTML = '<i></i><i></i><i></i>';
  log.append(typing);
  scrollBottom();

  try {
    const data = await api('/api/assistant', {
      method: 'POST',
      body: {
        message: value,
        lang: getLang(),
        history,
        visitor_id: visitorId(),
      },
    });
    const text = typeof data?.reply?.text === 'string' ? data.reply.text : '';
    if (text === '') throw new Error('empty_reply');
    messages.push({
      role: 'assistant',
      text,
      services: Array.isArray(data.reply.services) ? data.reply.services.slice(0, 4) : [],
    });
    typing.remove();
    saveAndRender();
  } catch (error) {
    typing.remove();
    showError(error?.code === 'rate_limited' ? t('err.rate_limited') : t('assistant.error'));
  } finally {
    setBusy(false);
    input.focus();
  }
}

function setOpen(open) {
  panel.hidden = !open;
  fab.setAttribute('aria-expanded', String(open));
  host.classList.toggle('is-open', open);
  if (open) {
    renderMessages();
    requestAnimationFrame(() => input.focus());
  }
}

function applyLabels() {
  fab.setAttribute('aria-label', t('assistant.open'));
  fab.title = t('assistant.open');
  host.querySelector('.assistant-fab-label').textContent = t('assistant.titleShort');
  panel.setAttribute('aria-label', t('assistant.title'));
  host.querySelector('.assistant-head b').textContent = t('assistant.title');
  host.querySelector('.assistant-head small').textContent = t('assistant.subtitle');
  host.querySelector('#assistant-close').setAttribute('aria-label', t('assistant.close'));
  host.querySelector('#assistant-reset').setAttribute('aria-label', t('assistant.reset'));
  host.querySelector('#assistant-reset').title = t('assistant.reset');
  input.placeholder = t('assistant.placeholder');
  input.setAttribute('aria-label', t('assistant.placeholder'));
  host.querySelector('.assistant-send').setAttribute('aria-label', t('assistant.send'));
  host.querySelector('.assistant-note').textContent = t('assistant.note');
  quick.innerHTML = QUICK_KEYS
    .map((key) => `<button type="button" data-quick="${key}">${esc(t(`assistant.${key}`))}</button>`)
    .join('');
}

export function setAssistantLang() {
  if (!host) return;
  applyLabels();
  renderMessages();
}

export function mountAssistant() {
  if (host) return;
  host = document.createElement('div');
  host.className = 'assistant';
  host.id = 'assistant';
  host.innerHTML = `
    <section class="assistant-panel" id="assistant-panel" role="dialog" aria-label="" hidden>
      <header class="assistant-head">
        <span class="assistant-avatar">${icon('sparkles')}</span>
        <span class="assistant-head-text"><b></b><small></small></span>
        <button class="icon-btn" id="assistant-reset" type="button">${icon('trash')}</button>
        <button class="icon-btn" id="assistant-close" type="button">${icon('close')}</button>
      </header>
      <div class="assistant-log" id="assistant-log" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="assistant-quick" id="assistant-quick"></div>
      <form class="assistant-form" id="assistant-form">
        <input class="input" id="assistant-input" type="text" maxlength="600" autocomplete="off" enterkeyhint="send">
        <button class="btn btn-primary assistant-send" type="submit">${icon('arrowRight')}</button>
      </form>
      <p class="assistant-note"></p>
    </section>
    <button class="assistant-fab" id="assistant-fab" type="button" aria-expanded="false" aria-controls="assistant-panel">
      ${icon('sparkles')}<span class="assistant-fab-label"></span>
    </button>`;
  document.body.append(host);

  fab = host.querySelector('#assistant-fab');
  panel = host.querySelector('#assistant-panel');
  log = host.querySelector('#assistant-log');
  input = host.querySelector('#assistant-input');
  form = host.querySelector('#assistant-form');
  quick = host.querySelector('#assistant-quick');

  messages = loadMessages();
  if (messages.length === 0) messages = [{ role: 'assistant', key: 'greeting' }];

  applyLabels();
  renderMessages();

  fab.addEventListener('click', () => setOpen(panel.hidden));
  host.querySelector('#assistant-close').addEventListener('click', () => setOpen(false));
  host.querySelector('#assistant-reset').addEventListener('click', () => { seedGreeting(); input.focus(); });
  host.querySelector('#assistant-form').addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
  quick.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick]');
    if (!button) return;
    send(t(`assistant.${button.dataset.quick}`));
  });
  log.addEventListener('click', (event) => {
    if (event.target.closest('.assistant-card')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
}
