import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const BASE = 'http://127.0.0.1:4173';
const SHOTS = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(SHOTS, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const problems = [];

const watch = (page, label) => {
  page.on('pageerror', (error) => problems.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location()?.url ?? '';
    if (/401/.test(message.text()) && url.includes('/api/me')) return;
    problems.push(`${label} console: ${message.text()} ${url}`);
  });
};
const clearInput = async (page, selector) => {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
};
const scrollTo = (page, selector) => page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), selector);
const chooseLang = async (page, lang) => {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate((value) => {
      const select = document.querySelector('#lang-select');
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, lang),
  ]);
};
const tapLang = async (page, lang) => {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click(`.lang-chip[data-lang="${lang}"]`),
  ]);
};
const staticDoc = async (pathname) => {
  const response = await fetch(`${BASE}${pathname}`);
  const text = await response.text();
  return {
    status: response.status,
    title: /<title>([^<]*)<\/title>/.exec(text)?.[1] ?? '',
    description: /<meta name="description" content="([^"]*)"/.exec(text)?.[1] ?? '',
    robots: /<meta name="robots" content="([^"]*)"/.exec(text)?.[1] ?? '',
  };
};
const decodeQrPng = (buffer) => {
  const source = PNG.sync.read(buffer);
  const scan = (bitmap, width, height) => jsQR(new Uint8ClampedArray(bitmap), width, height);
  const upscaled = (scale) => {
    const big = new PNG({ width: source.width * scale, height: source.height * scale });
    for (let y = 0; y < big.height; y += 1) {
      for (let x = 0; x < big.width; x += 1) {
        const s = (((y / scale) | 0) * source.width + ((x / scale) | 0)) * 4;
        const d = (y * big.width + x) * 4;
        big.data[d] = source.data[s];
        big.data[d + 1] = source.data[s + 1];
        big.data[d + 2] = source.data[s + 2];
        big.data[d + 3] = 255;
      }
    }
    return big;
  };
  for (const scale of [1, 2, 3]) {
    const bitmap = scale === 1 ? source : upscaled(scale);
    const found = scan(bitmap.data, bitmap.width, bitmap.height);
    if (found?.data) return found.data;
  }
  return null;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

try {
  /* ---------- real documents ---------- */
console.log('step: static documents');
  const homeDoc = await staticDoc('/');
  const servicesDoc = await staticDoc('/services/');
  const bookingDoc = await staticDoc('/booking/');
  const loginDoc = await staticDoc('/login/');
  const accountDoc = await staticDoc('/account/');
  const adminDoc = await staticDoc('/admin/');
  const missingDoc = await staticDoc('/definitely-missing-page');
  assert.ok(homeDoc.title.includes('детское спа'), `home title: ${homeDoc.title}`);
  assert.ok(servicesDoc.title.includes('Программы'), `services title: ${servicesDoc.title}`);
  assert.notEqual(servicesDoc.title, homeDoc.title, 'services has its own title');
  assert.ok(bookingDoc.description.includes('Запишите ребёнка'), 'booking has its own description');
  assert.notEqual(bookingDoc.description, homeDoc.description);
  assert.equal(loginDoc.robots, 'noindex');
  assert.equal(accountDoc.robots, 'noindex');
  assert.equal(adminDoc.robots, 'noindex');
  assert.equal(missingDoc.status, 404, 'unknown page answers with 404');
  assert.ok(missingDoc.title.includes('не найдена'), `404 title: ${missingDoc.title}`);
  const trailing = await fetch(`${BASE}/services`, { redirect: 'manual' });
  assert.equal(trailing.status, 301, 'slug without slash redirects to the page document');
  assert.ok(trailing.headers.get('location') === '/services/');

  /* ---------- desktop ---------- */
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  watch(page, 'desktop');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.hero h1');
  await new Promise((resolve) => setTimeout(resolve, 900));
  await page.screenshot({ path: `${SHOTS}home-desktop.png` });
  assert.equal(await page.$eval('.hero h1', (node) => node.textContent.includes('Маленьким')), true);
  assert.equal(await page.$$eval('.main-nav a', (nodes) => nodes.length), 5);
  assert.ok(await page.$('#review-form-host .review-invite'), 'guest sees the review invite');

console.log('step: footer qr');
  const qrArt = await page.$('.qr-box .qr-art');
  assert.ok(qrArt, 'footer shows a QR code');
  assert.ok(await page.evaluate(() => document.querySelector('.qr-box .qr-caption')?.textContent.includes('камеру')), 'qr caption invites a camera scan');
  const qrPng = await qrArt.screenshot({ path: `${SHOTS}footer-qr.png` });
  const decoded = decodeQrPng(qrPng);
  assert.equal(decoded, `${BASE}/`, `qr scan opens the site: ${decoded}`);

console.log('step: assistant');
  await page.click('#assistant-fab');
  await page.waitForSelector('.assistant-panel:not([hidden])');
  const greeting = await page.$eval('#assistant-log', (node) => node.textContent);
  assert.ok(greeting.includes('помощник AURA kids'), 'greeting is localized');
  await page.click('[data-quick="quickPrice"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.assistant-msg.bot')].some((node) => node.textContent.includes('₸')), { timeout: 15000 });
  assert.ok(await page.$$eval('.assistant-card', (nodes) => nodes.length) > 0, 'assistant shows program cards');
  const cardHref = await page.$eval('.assistant-card', (node) => node.getAttribute('href'));
  assert.ok(cardHref.startsWith('/booking/?service='), `card deep-links to booking: ${cardHref}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot({ path: `${SHOTS}assistant-desktop.png` });
  await page.click('#assistant-close');
  await page.waitForFunction(() => document.querySelector('#assistant-panel')?.hidden === true);

console.log('step: services');
  await page.evaluate(() => { window.__mpaMarker = 'spa'; });
  await page.click('.main-nav a[href="/services/"]');
  await page.waitForSelector('#svc-grid .service-card');
  assert.equal(await page.evaluate(() => window.__mpaMarker ?? null), null, 'navigation loads a fresh document, not an in-place view');
  assert.ok(page.url().endsWith('/services/'), `services is its own URL: ${page.url()}`);
  assert.ok((await page.title()).includes('Программы детского спа'), `services keeps its own document title: ${await page.title()}`);
  const total = await page.$$eval('#svc-grid .service-card', (nodes) => nodes.length);
  assert.equal(total, 9);
  await page.type('#svc-search', 'массаж');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const searched = await page.$$eval('#svc-grid .service-card', (nodes) => nodes.length);
  assert.ok(searched > 0 && searched < total, `search filtered: ${searched}`);
  await clearInput(page, '#svc-search');
  await page.click('[data-cat="Праздники и программы"]');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const rituals = await page.$$eval('#svc-grid .service-card', (nodes) => nodes.length);
  assert.ok(rituals >= 1 && rituals < total);
  await page.screenshot({ path: `${SHOTS}services-desktop.png` });
  await page.click('[data-cat="Все"]');
  await new Promise((resolve) => setTimeout(resolve, 200));

  /* booking wizard: pick -> date/slot -> register -> confirm */
console.log('step: booking wizard');
  await page.click('#svc-grid .service-card a[href^="/booking/"]');
  await page.waitForSelector('.date-cell');
  assert.ok(page.url().includes('/booking/'), `booking is its own document: ${page.url()}`);
  assert.ok((await page.title()).includes('Онлайн-запись'), `booking keeps its own document title: ${await page.title()}`);
  await page.click('.date-strip .date-cell:nth-child(3)');
  await page.waitForSelector('.slot:not([disabled])');
  await page.click('.slot:not([disabled])');
  await page.click('[data-next]');
  await page.waitForSelector('#auth-form');
  await page.click('[data-auth-mode="register"]');
  await page.waitForSelector('#f-name');
  await page.type('#f-name', 'Тест Гостевой');
  await page.type('#f-email', `qa.guest.${Date.now()}@example.com`);
  await page.type('#f-phone', '+7 916 555-01-02');
  await page.type('#f-password', 'QaGuest-2026');
  await page.click('#auth-submit');
  await page.waitForSelector('#book-form');
  await page.type('#b-child-name', 'Тест Малыш');
  await page.type('#b-child-age', '4');
  await page.screenshot({ path: `${SHOTS}booking-summary.png` });
  await page.click('#book-submit');
  await page.waitForSelector('.success-panel');
  await page.screenshot({ path: `${SHOTS}booking-success.png` });

  /* account: upcoming, cancel, profile edit, logout */
console.log('step: account');
  await page.click('.success-panel a[href="/account/"]');
  await page.waitForSelector('.booking-row');
  await page.waitForSelector('#visits [data-cancel]');
  const profileFits = await page.evaluate(() => {
    const card = document.querySelector('.profile-card').getBoundingClientRect();
    const input = document.querySelector('#p-name').getBoundingClientRect();
    return input.right <= card.right - 10;
  });
  assert.ok(profileFits, 'profile form fits inside card');
  await page.screenshot({ path: `${SHOTS}account-desktop.png`, fullPage: true });
  await page.click('[data-cancel]');
  await page.waitForSelector('.modal-host.open [data-yes]');
  await page.click('.modal-host.open [data-yes]');
  await page.waitForSelector('.booking-row .chip.st-cancelled');
  await clearInput(page, '#p-name');
  await page.type('#p-name', 'Тест Гостевой Обновлённый');
  await page.click('#profile-submit');
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent.includes('Обновлённый'));

console.log('step: leave review');
  await page.goto(`${BASE}/#reviews`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#review-form');
  await page.type('#review-body', 'QA отзыв: малышу понравились пузырьки, мастер была очень внимательна.');
  await page.click('#review-submit');
  await page.waitForFunction(() => document.querySelector('#reviews-list')?.textContent.includes('QA отзыв'));
  await new Promise((resolve) => setTimeout(resolve, 800));
  await page.screenshot({ path: `${SHOTS}reviews-desktop.png` });

  await page.goto(`${BASE}/account/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#logout-btn');
  await page.click('#logout-btn');
  await page.waitForSelector('.hero h1');
  assert.ok(await page.$('.header-actions a[href="/login/"]'));

  /* admin flows */
console.log('step: admin login');
  await page.goto(`${BASE}/login/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#f-email');
  await page.type('#f-email', 'admin@aura-kids.ru');
  await page.type('#f-password', 'Aura-Admin-2026');
  await page.click('#auth-submit');
  await page.waitForSelector('.admin-shell');
  assert.ok(page.url().endsWith('/admin/'), `login opens the admin document: ${page.url()}`);
  await page.waitForSelector('.stat-cards .stat-card');
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.screenshot({ path: `${SHOTS}admin-overview.png`, fullPage: true });
  const statCount = await page.$$eval('.stat-cards .stat-card', (nodes) => nodes.length);
  assert.equal(statCount, 3, 'admin sees three overview cards, without revenue');
  assert.equal(await page.$$eval('[data-tab="services"]', (nodes) => nodes.length), 1, 'admin edits the catalog tab');
  assert.ok(await page.evaluate(() => document.querySelector('#admin-main .form-hint')?.textContent.includes('только владельцу')), 'admin sees the finance hint');
  assert.equal(await page.$$eval('.bars .bar', (nodes) => nodes.length), 14);

console.log('step: admin bookings');
  await page.click('[data-tab="bookings"]');
  await page.waitForSelector('table.data tbody tr[data-open]');
  await page.type('#bk-q', 'анна');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const filtered = await page.$$eval('table.data tbody tr[data-open]', (nodes) => nodes.length);
  assert.ok(filtered >= 1);
  await clearInput(page, '#bk-q');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const pendingId = await page.evaluate(() => {
    const row = [...document.querySelectorAll('table.data tbody tr[data-open]')].find((tr) => tr.querySelector('.chip.st-pending'));
    return row?.dataset.open ?? null;
  });
  assert.ok(pendingId, 'seeded pending booking exists');
  await page.click(`tr[data-open="${pendingId}"]`);
  await page.waitForSelector('.drawer [data-target="confirmed"]');
  await page.click('.drawer [data-target="confirmed"]');
  await page.waitForSelector('.drawer #drawer-status .st-confirmed');
  await page.click('.drawer [data-target="completed"]');
  await page.waitForSelector('.drawer #drawer-status .st-completed');
  await page.screenshot({ path: `${SHOTS}admin-drawer.png` });
  await page.click('.drawer [data-dclose]');

console.log('step: admin comments');
  await page.click('[data-tab="comments"]');
  await page.waitForSelector('[data-comment-active]');
  assert.ok(await page.evaluate(() => document.querySelector('table.data').textContent.includes('QA отзыв')));
  const commentId = await page.evaluate(() => {
    const row = [...document.querySelectorAll('table.data tbody tr')].find((tr) => tr.textContent.includes('QA отзыв'));
    return row.querySelector('[data-comment-active]').dataset.commentActive;
  });
  await page.click(`[data-comment-active="${commentId}"]`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await page.$eval(`[data-comment-active="${commentId}"]`, (node) => node.checked), false);
  await scrollTo(page, `[data-reply="${commentId}"]`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.click(`[data-reply="${commentId}"]`);
  await page.waitForSelector('#reply-form');
  await page.type('#reply-body', 'Спасибо за отзыв от команды AURA kids! Будем рады видеть вас снова.');
  await page.click('#reply-submit');
  await page.waitForFunction(() => !document.querySelector('.modal-host.open'));
  await page.waitForFunction((id) => document.querySelector(`[data-reply="${id}"]`)?.textContent.includes('Изменить ответ'), {}, commentId);
  await page.screenshot({ path: `${SHOTS}admin-comments.png`, fullPage: true });

console.log('step: admin services');
  await page.click('[data-tab="services"]');
  await page.waitForSelector('#service-new');
  await page.click('#service-new');
  await page.waitForSelector('#service-form');
  await page.type('#s-title', 'QA Тест-программа');
  await page.type('#s-desc', 'Проверочная программа для автотеста качества интерфейса.');
  await page.click('#service-submit');
  await page.waitForFunction(() => !document.querySelector('.modal-host.open'));
  await page.waitForFunction(() => [...document.querySelectorAll('table.data tbody tr')].some((tr) => tr.textContent.includes('QA Тест-программа')));
  const rowSelector = await page.evaluate(() => {
    const row = [...document.querySelectorAll('table.data tbody tr')].find((tr) => tr.textContent.includes('QA Тест-программа'));
    return row.querySelector('[data-edit]').dataset.edit;
  });
  await scrollTo(page, `[data-edit="${rowSelector}"]`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.click(`[data-edit="${rowSelector}"]`);
  await page.waitForSelector('#service-form');
  await clearInput(page, '#s-price');
  await page.type('#s-price', '4600');
  await page.click('#service-submit');
  await page.waitForFunction(() => !document.querySelector('.modal-host.open'));
  await page.waitForFunction((id) => /4\s600/.test(document.querySelector(`[data-active="${id}"]`)?.closest('tr').textContent ?? ''), {}, rowSelector);
console.log('step: toggle active');
  await scrollTo(page, `[data-active="${rowSelector}"]`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.click(`[data-active="${rowSelector}"]`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await page.$eval(`[data-active="${rowSelector}"]`, (node) => node.checked), false);
  await page.click(`[data-active="${rowSelector}"]`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await scrollTo(page, `[data-delete="${rowSelector}"]`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.click(`[data-delete="${rowSelector}"]`);
  await page.waitForSelector('.modal-host.open [data-yes]');
  await page.click('.modal-host.open [data-yes]');
  await page.waitForFunction((id) => !document.querySelector(`[data-delete="${id}"]`), {}, rowSelector);
  await page.screenshot({ path: `${SHOTS}admin-services.png`, fullPage: true });

console.log('step: admin clients');
  await page.click('[data-tab="clients"]');
  await page.waitForSelector('table.data tbody tr');
  assert.ok(await page.evaluate(() => document.querySelector('table.data').textContent.includes('Тест Гостевой Обновлённый')));
  assert.equal(await page.$$eval('table.data thead th', (nodes) => nodes.some((th) => th.textContent.includes('Потрачено'))), false, 'admin sees no spend column');
  assert.ok(await page.evaluate(() => document.querySelector('.form-hint')?.textContent.includes('роли родителей и администраторов')));
  const adminRoleUi = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table.data tbody tr')];
    const ownerRow = rows.find((row) => row.textContent.includes('Владелец AURA kids'));
    const selfRow = rows.find((row) => row.textContent.includes('Администратор AURA kids'));
    return {
      selects: document.querySelectorAll('[data-role-user]').length,
      users: rows.length,
      ownerSelect: Boolean(ownerRow?.querySelector('[data-role-user]')),
      selfSelect: Boolean(selfRow?.querySelector('[data-role-user]')),
      ownerBadge: Boolean(ownerRow?.querySelector('.chip.role-owner')),
    };
  });
  assert.equal(adminRoleUi.selects, adminRoleUi.users - 2, 'admin changes every role except the owner and their own');
  assert.equal(adminRoleUi.ownerSelect, false, 'owner role is locked for admins');
  assert.equal(adminRoleUi.selfSelect, false, 'admin has no self role select');
  assert.ok(adminRoleUi.ownerBadge, 'owner badge is visible');

  const guestId = await page.evaluate(() => {
    const row = [...document.querySelectorAll('table.data tbody tr')].find((tr) => tr.textContent.includes('Тест Гостевой Обновлённый'));
    return row.querySelector('[data-role-user]').dataset.roleUser;
  });
  await page.select(`[data-role-user="${guestId}"]`, 'admin');
  await page.waitForSelector('.modal-host.open [data-yes]');
  await page.click('.modal-host.open [data-yes]');
  await page.waitForFunction((id) => document.querySelector(`[data-role-user="${id}"]`)?.value === 'admin', {}, guestId);
  await page.click('[data-role-filter="owner"]');
  await page.waitForFunction(() => document.querySelectorAll('table.data tbody tr').length === 1);
  await page.click('[data-role-filter="all"]');
  await page.waitForFunction(() => document.querySelectorAll('table.data tbody tr').length > 1);
  await page.screenshot({ path: `${SHOTS}admin-roles.png`, fullPage: true });
  await page.select(`[data-role-user="${guestId}"]`, 'client');
  await page.waitForSelector('.modal-host.open [data-yes]');
  await page.click('.modal-host.open [data-yes]');
  await page.waitForFunction((id) => document.querySelector(`[data-role-user="${id}"]`)?.value === 'client', {}, guestId);

  /* owner flows: full visibility, no edits */
console.log('step: owner login');
  const ownerContext = await browser.createBrowserContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.setViewport({ width: 1440, height: 1000 });
  watch(ownerPage, 'owner');
  await ownerPage.goto(`${BASE}/login/`, { waitUntil: 'networkidle0' });
  await ownerPage.waitForSelector('#f-email');
  await ownerPage.type('#f-email', 'owner@aura-kids.kz');
  await ownerPage.type('#f-password', 'Aura-Owner-2026');
  await ownerPage.click('#auth-submit');
  await ownerPage.waitForSelector('.admin-shell');
  await ownerPage.waitForSelector('.stat-cards .stat-card');
  assert.equal(await ownerPage.$$eval('.stat-cards .stat-card', (nodes) => nodes.length), 4, 'owner sees the revenue card');
  assert.ok(await ownerPage.$('[data-tab="services"]'), 'owner sees the catalog tab');
  assert.ok(await ownerPage.evaluate(() => document.querySelector('.admin-side .chip')?.textContent.includes('Только просмотр')), 'owner sees the view-only badge');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await ownerPage.screenshot({ path: `${SHOTS}owner-overview.png`, fullPage: true });

console.log('step: owner read-only');
  await ownerPage.click('[data-tab="services"]');
  await ownerPage.waitForSelector('table.data tbody tr');
  assert.equal(await ownerPage.$$eval('#service-new', (nodes) => nodes.length), 0, 'owner cannot create programs');
  assert.equal(await ownerPage.$$eval('[data-edit]', (nodes) => nodes.length), 0, 'owner cannot edit programs');
  assert.equal(await ownerPage.$$eval('[data-active]', (nodes) => nodes.length), 0, 'owner cannot toggle programs');
  assert.ok(await ownerPage.$$eval('table.data tbody .chip.st-confirmed', (nodes) => nodes.length) > 0, 'owner reads catalog state');
  await ownerPage.screenshot({ path: `${SHOTS}owner-services.png`, fullPage: true });

  await ownerPage.click('[data-tab="comments"]');
  await ownerPage.waitForSelector('table.data tbody tr');
  assert.equal(await ownerPage.$$eval('[data-comment-active]', (nodes) => nodes.length), 0, 'owner cannot moderate reviews');
  assert.equal(await ownerPage.$$eval('[data-comment-delete]', (nodes) => nodes.length), 0, 'owner cannot delete reviews');
  assert.ok(await ownerPage.evaluate(() => document.querySelector('table.data tbody').textContent.includes('Опубликован')), 'owner reads review status');
  await ownerPage.screenshot({ path: `${SHOTS}owner-comments.png`, fullPage: true });

  await ownerPage.click('[data-tab="bookings"]');
  await ownerPage.waitForSelector('tr[data-open]');
  await ownerPage.click('tr[data-open]');
  await ownerPage.waitForSelector('.drawer');
  assert.equal(await ownerPage.$$eval('.drawer [data-target]', (nodes) => nodes.length), 0, 'owner cannot change visit statuses');
  assert.ok(await ownerPage.evaluate(() => document.querySelector('#drawer-actions')?.textContent.includes('администратор')), 'owner sees who changes statuses');
  await ownerPage.screenshot({ path: `${SHOTS}owner-drawer.png` });
  await ownerPage.click('.drawer [data-dclose]');

  await ownerPage.click('[data-tab="clients"]');
  await ownerPage.waitForSelector('table.data tbody tr');
  assert.equal(await ownerPage.$$eval('[data-role-user]', (nodes) => nodes.length), 0, 'owner cannot change roles');
  assert.ok(await ownerPage.evaluate(() => [...document.querySelectorAll('table.data thead th')].some((th) => th.textContent.includes('Потрачено'))), 'owner sees the spend column');
  assert.ok(await ownerPage.evaluate(() => document.querySelector('table.data tbody')?.textContent.includes('₸')), 'owner sees client totals');
  await ownerPage.screenshot({ path: `${SHOTS}owner-clients.png`, fullPage: true });

console.log('step: owner replies to a review');
  await ownerPage.click('[data-tab="comments"]');
  await ownerPage.waitForSelector('[data-reply]');
  const ownerReplyId = await ownerPage.evaluate(() => {
    const row = [...document.querySelectorAll('table.data tbody tr')].find((tr) => tr.textContent.includes('домом с пузырьками'));
    return row?.querySelector('[data-reply]')?.dataset.reply ?? null;
  });
  assert.ok(ownerReplyId, 'owner can answer a published review');
  await scrollTo(ownerPage, `[data-reply="${ownerReplyId}"]`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await ownerPage.click(`[data-reply="${ownerReplyId}"]`);
  await ownerPage.waitForSelector('#reply-form');
  await clearInput(ownerPage, '#reply-body');
  await ownerPage.type('#reply-body', 'Спасибо, что выбираете AURA kids! Обнимаем Мишу и ждём снова.');
  await ownerPage.click('#reply-submit');
  await ownerPage.waitForFunction(() => !document.querySelector('.modal-host.open'));
  await ownerPage.waitForFunction((id) => document.querySelector(`[data-reply="${id}"]`)?.textContent.includes('Изменить ответ'), {}, ownerReplyId);
  await ownerPage.screenshot({ path: `${SHOTS}owner-replies.png`, fullPage: true });

  await ownerPage.goto(`${BASE}/#reviews`, { waitUntil: 'networkidle0' });
  await ownerPage.waitForSelector('#reviews-list .review');
  assert.ok(await ownerPage.evaluate(() => document.querySelector('#reviews-list')?.textContent.includes('Обнимаем Мишу и ждём снова.')), 'studio reply is visible to parents');
  assert.ok(await ownerPage.evaluate(() => document.querySelector('#reviews-list .review-reply')?.textContent.includes('Ответ студии')), 'reply is labelled as the studio answer');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await ownerPage.screenshot({ path: `${SHOTS}reviews-owner-reply.png` });
  await ownerContext.close();

  /* ---------- theme + languages ---------- */
console.log('step: theme + languages');
  const themeContext = await browser.createBrowserContext();
  const themePage = await themeContext.newPage();
  await themePage.setViewport({ width: 1440, height: 1000 });
  watch(themePage, 'theme');
  await themePage.goto(BASE, { waitUntil: 'networkidle0' });
  await themePage.waitForSelector('.hero h1');
  const initialTheme = await themePage.evaluate(() => document.documentElement.dataset.theme);
  assert.ok(['light', 'dark'].includes(initialTheme), `initial theme: ${initialTheme}`);
  const bgBefore = await themePage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await themePage.click('#theme-toggle');
  const toggled = await themePage.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem('aura-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  assert.notEqual(toggled.theme, initialTheme);
  assert.equal(toggled.stored, toggled.theme);
  assert.notEqual(toggled.bg, bgBefore, 'background follows the theme');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await themePage.screenshot({ path: `${SHOTS}home-theme-${toggled.theme}.png` });
  await themePage.reload({ waitUntil: 'networkidle0' });
  assert.equal(await themePage.evaluate(() => document.documentElement.dataset.theme), toggled.theme, 'theme survives reload');

  await chooseLang(themePage, 'en');
  await themePage.waitForFunction(() => document.querySelector('.hero h1')?.textContent.includes('A big spa for'));
  assert.ok((await themePage.title()).includes('kids spa in Almaty'), `title follows the language: ${await themePage.title()}`);
  assert.ok(await themePage.evaluate(() => [...document.querySelectorAll('.main-nav a')].some((link) => link.textContent.trim() === 'Programs')));
  const priceEn = await themePage.evaluate(() => document.querySelector('.program-card .price, .price')?.textContent.trim() ?? '');
  assert.ok(priceEn.includes('₸'), `price shows tenge: ${priceEn}`);
  assert.ok((await themePage.$eval('#assistant-input', (node) => node.placeholder)).includes('Ask about'), 'assistant labels follow the language');
  assert.ok((await themePage.$eval('#assistant-log', (node) => node.textContent)).includes('Hello! I am the AURA kids assistant'), 'assistant greeting follows the language');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await themePage.screenshot({ path: `${SHOTS}home-en.png` });

  await themePage.goto(`${BASE}/services/`, { waitUntil: 'networkidle0' });
  await themePage.waitForSelector('#svc-grid .service-card');
  assert.ok((await themePage.$eval('#svc-grid', (node) => node.textContent)).includes('Milky bath with clouds'));
  await chooseLang(themePage, 'kk');
  await themePage.waitForFunction(() => document.querySelector('#svc-grid')?.textContent.includes('Бұлтты сүт ваннасы'));
  assert.ok((await themePage.title()).includes('Бағдарламалар мен бағалар'), `services title follows Kazakh: ${await themePage.title()}`);
  assert.ok(await themePage.evaluate(() => [...document.querySelectorAll('.main-nav a')].some((link) => link.textContent.trim() === 'Қызметтер')));
  assert.ok((await themePage.$eval('#svc-grid', (node) => node.textContent)).includes('Бұлтты сүт ваннасы'));
  const priceKk = await themePage.evaluate(() => document.querySelector('.service-card .price')?.textContent.trim() ?? '');
  assert.ok(priceKk.includes('₸'), `Kazakh price shows tenge: ${priceKk}`);
  assert.ok((await themePage.$eval('#assistant-input', (node) => node.placeholder)).includes('сұраңыз'), 'assistant labels switch to Kazakh');
  assert.ok((await themePage.$eval('#assistant-log', (node) => node.textContent)).includes('Сәлеметсіз бе'), 'assistant greeting switches to Kazakh');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await themePage.screenshot({ path: `${SHOTS}services-kk.png`, fullPage: true });
  await themeContext.close();

  /* ---------- mobile ---------- */
console.log('step: mobile');
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  watch(mobile, 'mobile');
  await mobile.goto(BASE, { waitUntil: 'networkidle0' });
  await mobile.waitForSelector('.hero h1');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await mobile.screenshot({ path: `${SHOTS}home-mobile.png` });
  const overflowHome = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflowHome <= 0, `home horizontal overflow: ${overflowHome}`);
  await mobile.evaluate(() => document.getElementById('reviews')?.scrollIntoView());
  await new Promise((resolve) => setTimeout(resolve, 900));
  await mobile.screenshot({ path: `${SHOTS}reviews-mobile.png` });
  const overflowReviews = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflowReviews <= 0, `reviews horizontal overflow: ${overflowReviews}`);
  await mobile.evaluate(() => window.scrollTo({ top: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mobile.click('#burger');
  await mobile.waitForSelector('.mobile-nav.open');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await mobile.screenshot({ path: `${SHOTS}mobile-menu.png` });
  assert.equal(await mobile.$$eval('.lang-chip', (nodes) => nodes.length), 3);
  const mobileThemeBefore = await mobile.evaluate(() => document.documentElement.dataset.theme);
  await mobile.click('#theme-toggle-mobile');
  const mobileThemeAfter = await mobile.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem('aura-theme'),
  }));
  assert.notEqual(mobileThemeAfter.theme, mobileThemeBefore);
  assert.equal(mobileThemeAfter.stored, mobileThemeAfter.theme);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mobile.screenshot({ path: `${SHOTS}mobile-menu-toggled.png` });
  await tapLang(mobile, 'kk');
  await mobile.waitForFunction(() => document.querySelector('.hero h1')?.textContent.includes('Кішкентай'));
  await new Promise((resolve) => setTimeout(resolve, 700));
  await mobile.screenshot({ path: `${SHOTS}home-mobile-kk.png` });
  await mobile.click('#burger');
  await mobile.waitForSelector('.mobile-nav.open');
  await tapLang(mobile, 'ru');
  await mobile.waitForFunction(() => document.querySelector('.hero h1')?.textContent.includes('Маленьким'));
  await mobile.click('#burger');
  await mobile.waitForSelector('.mobile-nav.open');
  await mobile.click('#theme-toggle-mobile');
  assert.equal(await mobile.evaluate(() => document.documentElement.dataset.theme), mobileThemeBefore);
  await mobile.click('#burger');
  const menuClosed = await mobile.evaluate(() => !document.querySelector('.mobile-nav')?.classList.contains('open'));
  assert.ok(menuClosed);
  await mobile.click('#burger');
  await mobile.waitForSelector('.mobile-nav.open');
  await mobile.click('.mobile-nav a[href="/services/"]');
  await mobile.waitForSelector('#svc-grid .service-card');
  assert.ok(mobile.url().endsWith('/services/'), `mobile navigation opens the services document: ${mobile.url()}`);
  const overflowServices = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflowServices <= 0, `services horizontal overflow: ${overflowServices}`);
  await mobile.screenshot({ path: `${SHOTS}services-mobile.png`, fullPage: true });

  await mobile.goto(`${BASE}/booking/`, { waitUntil: 'networkidle0' });
  await mobile.waitForSelector('.pick');
  await mobile.click('.pick');
  await mobile.waitForSelector('.date-cell');
  await mobile.click('.date-strip .date-cell:nth-child(3)');
  await mobile.waitForSelector('.slot:not([disabled])');
  await mobile.screenshot({ path: `${SHOTS}booking-mobile.png`, fullPage: true });
  const overflowBooking = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflowBooking <= 0, `booking horizontal overflow: ${overflowBooking}`);

  await mobile.goto(`${BASE}/admin/`, { waitUntil: 'networkidle0' });
  await mobile.waitForSelector('.stat-cards .stat-card');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await mobile.screenshot({ path: `${SHOTS}admin-mobile.png`, fullPage: true });
  const overflowAdmin = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflowAdmin <= 0, `admin horizontal overflow: ${overflowAdmin}`);

  console.log('step: assistant mobile');
  await mobile.goto(BASE, { waitUntil: 'networkidle0' });
  await mobile.waitForSelector('.hero h1');
  await mobile.click('#assistant-fab');
  await mobile.waitForSelector('.assistant-panel:not([hidden])');
  await mobile.click('[data-quick="quickBirthday"]');
  await mobile.waitForFunction(() => [...document.querySelectorAll('.assistant-msg.bot')].some((node) => node.textContent.includes('₸')), { timeout: 15000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await mobile.screenshot({ path: `${SHOTS}assistant-mobile.png` });
  const overflowAssistant = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflowAssistant <= 0, `assistant horizontal overflow: ${overflowAssistant}`);
  await mobile.click('#assistant-close');

  console.log('QA PASS: desktop + mobile flows complete');
} catch (error) {
  console.error('QA FAIL:', error.stack || error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (problems.length) {
  console.error('Runtime problems:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('No unexpected console errors or page errors.');
}