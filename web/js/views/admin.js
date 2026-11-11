import { api, errorText } from '../api.js';
import { esc, icon, image, fmtPrice, fmtDuration, fmtDate, STATUS_KEYS, statusLabel, statusChip, ORDER_STATUS_KEYS, orderStatusLabel, orderStatusChip, paymentLabel, toast, confirmDialog, openModal, closeModal, debounce } from '../ui.js';
import { t, plural, serviceTitle, categoryLabel } from '../i18n.js';
import { ROLES, ASSIGNABLE_ROLES, isOwner, isAdmin } from '../roles.js';

const CATEGORIES = ['Ванны и сказки', 'Массажи и забота', 'Красота и грим', 'Праздники и программы'];
const ROLE_META = {
  owner: { key: 'roleOwner', icon: 'crown', cls: 'role-owner' },
  admin: { key: 'roleAdmin', icon: 'shield', cls: 'st-confirmed' },
  client: { key: 'roleUser', icon: 'user', cls: '' },
};
const roleLabel = (role) => t(`admin.${(ROLE_META[role] ?? ROLE_META.client).key}`);
const roleChip = (role) => {
  const meta = ROLE_META[role] ?? ROLE_META.client;
  return `<span class="chip ${meta.cls}">${icon(meta.icon)} ${roleLabel(role)}</span>`;
};
const IMAGES = ['k-bubbles', 'k-choco', 'k-massage', 'k-beauty', 'k-party', 'k-ritual', 'k-cave', 'k-hero'];
const IMAGE_LABELS = { 'k-bubbles': 'imgBaths', 'k-choco': 'imgChoco', 'k-massage': 'imgMassage', 'k-beauty': 'imgBeauty', 'k-party': 'imgParty', 'k-ritual': 'imgTales', 'k-cave': 'imgCave', 'k-hero': 'imgAtmosphere' };
const TABS = [
  ['overview', 'chart', 'tabOverview'],
  ['bookings', 'calendar', 'tabBookings'],
  ['orders', 'inbox', 'tabOrders'],
  ['comments', 'star', 'tabComments'],
  ['services', 'bubble', 'tabServices'],
  ['gallery', 'picture', 'tabGallery'],
  ['clients', 'users', 'tabClients'],
];
const ORDER_ACTIONS = { new: ['contacted', 'cancelled'], contacted: ['confirmed', 'cancelled'], confirmed: ['done', 'cancelled'], done: [], cancelled: [] };
const MAX_GALLERY_IMAGE = 1_500_000;
const moscowToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('galleryReadError'));
    reader.readAsDataURL(file);
  });
}

function loadBitmap(src) {
  return new Promise((resolve, reject) => {
    const bitmap = new Image();
    bitmap.onload = () => resolve(bitmap);
    bitmap.onerror = () => reject(new Error('galleryReadError'));
    bitmap.src = src;
  });
}

// Compress to a bounded JPEG data URL: the API only accepts raster data URLs
// up to 1.5M characters, so uploads are downscaled and re-encoded here.
async function prepareGalleryImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('galleryTypeError');
  const raw = await readAsDataUrl(file);
  if (raw.length <= MAX_GALLERY_IMAGE) return raw;
  const bitmap = await loadBitmap(raw);
  let width = bitmap.naturalWidth;
  let height = bitmap.naturalHeight;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  for (let attempt = 0; attempt < 7; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= MAX_GALLERY_IMAGE) return url;
    }
    width = Math.max(360, Math.round(width * 0.78));
    height = Math.max(240, Math.round(height * 0.78));
  }
  throw new Error('gallerySizeError');
}

export function adminView(state) {
  const owner = isOwner(state.user);
  return `
  <div class="admin-shell">
    <aside class="admin-side">
      <span class="label">${t('admin.manage')}</span>
      ${TABS.map(([key, ic, label], index) => `<button data-tab="${key}" class="${index === 0 ? 'active' : ''}">${icon(ic)} ${t(`admin.${label}`)}</button>`).join('')}
      <span class="label" style="margin-top:18px">${t('admin.studio')}</span>
      <button data-goto="/">${icon('arrowLeft')} ${t('admin.backSite')}</button>
      ${owner ? `<span class="chip st-confirmed" style="margin:14px 10px 0;justify-content:center">${icon('checkCircle')} ${t('admin.ownerCanManage')}</span>` : ''}
    </aside>
    <div class="admin-main" id="admin-main">
      <div class="skeleton" style="height:90px;margin-bottom:24px"></div>
      <div class="skeleton" style="height:260px"></div>
    </div>
  </div>`;
}

export function mountAdmin(root, state, { navigate, setUser, reloadServices }) {
  const main = root.querySelector('#admin-main');
  const data = { stats: null, bookings: [], orders: [], comments: [], services: [], gallery: [], users: [] };
  const ui = { tab: 'overview', q: '', status: 'all', sort: 'created', orderQ: '', orderStatus: 'all', clientQ: '', clientRole: 'all', serviceQ: '', loaded: false };
  let drawerHost = null;
  const owner = isOwner(state.user);
  const editor = isAdmin(state.user);

  const bookingTitle = (booking) => {
    const service = data.services.find((item) => item.id === booking.service_id)
      ?? state.services.find((item) => item.id === booking.service_id);
    return service ? serviceTitle(service) : booking.service_title;
  };
  const bookingChildren = (booking) => (Array.isArray(booking.participants) ? booking.participants : [])
    .map((child) => `${esc(child.name)}, ${plural('years', child.age)}`)
    .join(' · ');
  const commentTitle = (comment) => {
    const service = data.services.find((item) => item.id === comment.service_id);
    return service ? serviceTitle(service) : comment.service_title;
  };

  // Keep the cached public showcase in sync so the home page reflects edits
  // immediately when navigating back from the panel.
  function syncGallery() {
    state.gallery = data.gallery
      .filter((item) => item.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, title, title_kk, title_en, description, description_kk, description_en, image, sort_order }) =>
        ({ id, title, title_kk, title_en, description, description_kk, description_en, image, sort_order }));
  }

  root.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    ui.tab = button.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((node) => node.classList.toggle('active', node === button));
    render();
  }));
  root.querySelector('[data-goto]').addEventListener('click', () => navigate('/'));

  function closeDrawer() {
    drawerHost?.remove();
    drawerHost = null;
    document.body.classList.remove('no-scroll');
  }

  async function loadAll() {
    try {
      const [stats, bookings, orders, comments, services, gallery, users] = await Promise.all([
        api('/api/admin/stats'), api('/api/admin/bookings'), api('/api/admin/orders'), api('/api/admin/comments'),
        api('/api/admin/services'), api('/api/admin/gallery'), api('/api/admin/users'),
      ]);
      Object.assign(data, { stats, bookings, orders, comments, services, gallery, users });
      syncGallery();
      ui.loaded = true;
      render();
    } catch (err) {
      if (err.status === 401) { setUser(null); navigate('/login/?next=/admin/'); return; }
      if (err.status === 403) { toast(t('admin.forbidden'), 'error'); navigate('/account/'); return; }
      main.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('info')}</span><b>${t('admin.loadError')}</b><p>${esc(errorText(err))}</p><button class="btn btn-primary" id="admin-retry">${t('admin.retry')}</button></div>`;
      main.querySelector('#admin-retry').addEventListener('click', loadAll);
    }
  }

  /* ---------- Overview ---------- */

  function statCard(label, value, ic, note) {
    return `<div class="stat-card"><div class="top"><span>${label}</span><span class="ic">${icon(ic)}</span></div><b>${value}</b><small>${note}</small></div>`;
  }

  function overviewHtml() {
    const stats = data.stats;
    const max = Math.max(1, ...stats.days.map((day) => day.count));
    const total = Math.max(1, stats.total);
    const meterColor = { pending: 'var(--warn)', confirmed: 'var(--info)', completed: 'var(--ok)', cancelled: 'var(--danger)' };
    const recent = [...data.bookings].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
    return `
    <div class="admin-title"><div><h1>${t('admin.overviewTitle')}</h1><p>${t('admin.overviewLead')}</p></div>
      <button class="btn btn-soft btn-sm" id="refresh-all">${icon('sparkles')} ${t('admin.refresh')}</button></div>
    <div class="stat-cards">
      ${statCard(t('admin.totalBookings'), stats.total, 'calendar', t('admin.pendingNote', { n: stats.statusCounts.pending }))}
      ${statCard(t('admin.statOrders'), stats.orders?.total ?? 0, 'inbox', t('admin.statOrdersNote', { n: stats.orders?.new ?? 0 }))}
      ${statCard(t('admin.upcomingVisits'), stats.upcoming, 'clock', t('admin.upcomingNote'))}
      ${stats.revenue == null ? '' : statCard(t('admin.revenue'), fmtPrice(stats.revenue), 'wallet', t('admin.revenueNote'))}
      ${statCard(t('admin.parents'), stats.clients, 'users', t('admin.parentsNote'))}
    </div>
    ${owner ? '' : `<p class="form-hint" style="margin:-6px 0 18px">${t('admin.financeOwner')}</p>`}
    <div class="admin-panels">
      <div class="chart-panel">
        <h3>${t('admin.visits14')}</h3>
        <div class="bars">${stats.days.map((day) => `<div class="bar" title="${fmtDate(day.date)}: ${day.count}"><i style="height:${Math.max(3, (day.count / max) * 100)}%"></i></div>`).join('')}</div>
        <div class="bars-x">${stats.days.map((day) => `<span>${day.date.slice(8)}</span>`).join('')}</div>
      </div>
      <div class="chart-panel">
        <h3>${t('admin.statuses')}</h3>
        <div class="status-legend">
          ${STATUS_KEYS.map((key) => `
            <div class="row"><div class="t"><span>${statusLabel(key)}</span><b>${stats.statusCounts[key]}</b></div>
            <div class="meter"><i style="width:${(stats.statusCounts[key] / total) * 100}%;background:${meterColor[key]}"></i></div></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="table-panel" style="margin-top:var(--gap)">
      <h3>${t('admin.recent')}</h3>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('admin.thChild')}</th><th>${t('admin.thProgram')}</th><th>${t('admin.thVisit')}</th><th>${t('admin.thStatus')}</th><th>${t('admin.thAmount')}</th></tr></thead>
        <tbody>${recent.map((booking) => `
          <tr class="row-click" data-open="${booking.id}">
            <td><div class="cell-main"><b>${bookingChildren(booking) || '—'}</b><small>${esc(booking.client_name)} · ${esc(booking.client_email)}</small></div></td>
            <td>${esc(bookingTitle(booking))}</td>
            <td><div class="cell-main"><b>${fmtDate(booking.booking_date)}</b><small>${booking.slot}</small></div></td>
            <td>${statusChip(booking.status)}</td><td>${fmtPrice(booking.price)}</td>
          </tr>`).join('') || `<tr><td colspan="5" style="color:var(--site-muted)">${t('admin.noBookings')}</td></tr>`}</tbody>
      </table></div>
    </div>`;
  }

  /* ---------- Bookings ---------- */

  function filteredBookings() {
    const q = ui.q.trim().toLowerCase();
    let list = data.bookings.filter((booking) => {
      if (ui.status !== 'all' && booking.status !== ui.status) return false;
      if (!q) return true;
      return [...(booking.participants ?? []).map((child) => child.name), booking.client_name, booking.client_email, bookingTitle(booking), booking.client_phone].join(' ').toLowerCase().includes(q);
    });
    const sorters = {
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      date: (a, b) => (a.booking_date + a.slot).localeCompare(b.booking_date + b.slot),
      'date-desc': (a, b) => (b.booking_date + b.slot).localeCompare(a.booking_date + a.slot),
      price: (a, b) => b.price - a.price,
    };
    return list.sort(sorters[ui.sort] ?? sorters.created);
  }

  function bookingsHtml() {
    const list = filteredBookings();
    return `
    <div class="admin-title"><div><h1>${t('admin.bookingsTitle')}</h1><p>${t('admin.bookingsLead', { n: data.bookings.length })}</p></div></div>
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="bk-q" placeholder="${esc(t('admin.searchBookings'))}" value="${esc(ui.q)}"></div>
      <select class="input" id="bk-sort" aria-label="${esc(t('admin.sortNew'))}">
        <option value="created" ${ui.sort === 'created' ? 'selected' : ''}>${t('admin.sortNew')}</option>
        <option value="date" ${ui.sort === 'date' ? 'selected' : ''}>${t('admin.sortDateAsc')}</option>
        <option value="date-desc" ${ui.sort === 'date-desc' ? 'selected' : ''}>${t('admin.sortDateDesc')}</option>
        <option value="price" ${ui.sort === 'price' ? 'selected' : ''}>${t('admin.sortPrice')}</option>
      </select>
    </div>
    <div class="filter-chips" style="margin-bottom:16px">
      ${[['all', t('admin.filterAll')], ...STATUS_KEYS.map((key) => [key, statusLabel(key)])].map(([key, label]) =>
        `<button class="filter-chip ${ui.status === key ? 'active' : ''}" data-status="${key}">${label}</button>`).join('')}
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${t('admin.thChild')}</th><th>${t('admin.thProgram')}</th><th>${t('admin.thVisit')}</th><th>${t('admin.thStatus')}</th><th>${t('admin.thAmount')}</th><th>${t('admin.thCreated')}</th></tr></thead>
      <tbody>${list.map((booking) => `
        <tr class="row-click" data-open="${booking.id}">
          <td><div class="cell-main"><b>${bookingChildren(booking) || '—'}</b><small>${esc(booking.client_name)} · ${esc(booking.client_email)}</small></div></td>
          <td>${esc(bookingTitle(booking))}</td>
          <td><div class="cell-main"><b>${fmtDate(booking.booking_date, { weekday: true })}</b><small>${booking.slot}</small></div></td>
          <td>${statusChip(booking.status)}</td>
          <td>${fmtPrice(booking.price)}</td>
          <td style="color:var(--site-muted);white-space:nowrap">${fmtDate(booking.created_at.slice(0, 10))}</td>
        </tr>`).join('') || `<tr><td colspan="6"><div class="empty-state" style="padding:32px"><span class="ic">${icon('search')}</span><b>${t('admin.notFoundTitle')}</b><p>${t('admin.notFoundText')}</p></div></td></tr>`}</tbody>
    </table></div>`;
  }

  function bindBookings() {
    const q = main.querySelector('#bk-q');
    q?.addEventListener('input', debounce(() => {
      ui.q = q.value;
      const position = q.selectionStart;
      render();
      const next = main.querySelector('#bk-q');
      next.focus();
      next.setSelectionRange(position, position);
    }, 220));
    main.querySelector('#bk-sort')?.addEventListener('change', (event) => { ui.sort = event.target.value; render(); });
    main.querySelectorAll('[data-status]').forEach((chip) => chip.addEventListener('click', () => { ui.status = chip.dataset.status; render(); }));
    bindOpenRows();
  }

  function bindOpenRows() {
    main.querySelectorAll('[data-open]').forEach((row) => row.addEventListener('click', () => openBookingDrawer(row.dataset.open)));
  }

  function openBookingDrawer(id) {
    const booking = data.bookings.find((item) => item.id === id);
    if (!booking) return;
    closeDrawer();
    drawerHost = document.createElement('div');
    drawerHost.innerHTML = `
      <div class="drawer-scrim" data-dclose></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(t('admin.drawerTitle'))}">
        <div class="head"><h3>${t('admin.drawerTitle')}</h3><button class="icon-btn" data-dclose aria-label="${esc(t('ui.close'))}">${icon('close')}</button></div>
        <div style="display:flex;gap:14px;align-items:center">
          <span class="avatar" style="width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-family:var(--font-display);font-weight:700;background:linear-gradient(135deg,var(--site-accent),var(--violet));color:#fff">${esc(initials(booking.participants?.[0]?.name ?? ''))}</span>
          <div><b style="font-size:16px">${bookingChildren(booking) || '—'}</b><br><small style="color:var(--site-muted)">${esc(booking.client_name)} · ${esc(booking.client_email)}</small></div>
        </div>
        <div id="drawer-status">${statusChip(booking.status)}</div>
        <div class="kv">
          <div class="line"><span>${t('admin.program')}</span><b>${esc(bookingTitle(booking))}</b></div>
          <div class="line"><span>${t('admin.date')}</span><b>${fmtDate(booking.booking_date, { weekday: true, year: true })}</b></div>
          <div class="line"><span>${t('admin.time')}</span><b>${booking.slot}</b></div>
          <div class="line"><span>${t('admin.parent')}</span><b>${esc(booking.client_name)}</b></div>
          <div class="line"><span>${t('admin.phone')}</span><b><a href="tel:${esc(booking.client_phone.replace(/[^\d+]/g, ''))}">${esc(booking.client_phone)}</a></b></div>
          <div class="line"><span>${t('payment.label')}</span><b>${esc(paymentLabel(booking.payment_method))}</b></div>
          <div class="line"><span>${t('admin.amount')}</span><b class="price" style="font-size:16px">${fmtPrice(booking.price)}</b></div>
          <div class="line"><span>${t('admin.created')}</span><b>${fmtDate(booking.created_at.slice(0, 10), { year: true })}</b></div>
        </div>
        ${booking.comment ? `<div class="panel" style="padding:16px"><small style="color:var(--site-muted);font-weight:700">${t('admin.wishes')}</small><p style="font-size:14px;margin-top:6px">${esc(booking.comment)}</p></div>` : ''}
        <div id="drawer-actions" style="display:grid;gap:10px"></div>
      </aside>`;
    document.body.append(drawerHost);
    document.body.classList.add('no-scroll');
    drawerHost.querySelectorAll('[data-dclose]').forEach((node) => node.addEventListener('click', closeDrawer));
    renderDrawerActions(booking);
  }

  function renderDrawerActions(booking) {
    const host = drawerHost?.querySelector('#drawer-actions');
    if (!host) return;
    if (!editor) {
      host.innerHTML = `<p class="form-hint">${t('admin.ownerReadOnlyActions')}</p>`;
      return;
    }
    const future = booking.booking_date >= moscowToday();
    const actions = [];
    if (booking.status === 'pending') actions.push(['confirmed', 'btn-primary', 'check', t('admin.actConfirm')]);
    if (booking.status === 'confirmed') actions.push(['completed', 'btn-primary', 'check', t('admin.actComplete')]);
    if (['pending', 'confirmed'].includes(booking.status) && future) actions.push(['cancelled', 'btn-danger', 'close', t('admin.actCancel')]);
    host.innerHTML = actions.length
      ? actions.map(([target, cls, ic, label]) => `<button class="btn ${cls} btn-block" data-target="${target}">${icon(ic)} ${label}</button>`).join('')
      : `<p class="form-hint">${t('admin.noActions')}</p>`;
    host.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', async () => {
      const target = button.dataset.target;
      if (target === 'cancelled') {
        const ok = await confirmDialog({
          title: t('admin.cancelTitle'),
          message: t('admin.cancelMessage', {
            service: bookingTitle(booking),
            date: fmtDate(booking.booking_date),
            time: booking.slot,
          }),
          confirmLabel: t('admin.actCancel'),
          danger: true,
        });
        if (!ok) return;
      }
      host.querySelectorAll('button').forEach((node) => { node.disabled = true; });
      try {
        const result = await api(`/api/admin/bookings/${booking.id}`, { method: 'PATCH', body: { status: target } });
        booking.status = result.status;
        drawerHost.querySelector('#drawer-status').innerHTML = statusChip(booking.status);
        renderDrawerActions(booking);
        toast(t('admin.statusUpdated', { status: statusLabel(target).toLowerCase() }), 'success');
        refreshStats();
        render(false, true);
      } catch (err) {
        host.querySelectorAll('button').forEach((node) => { node.disabled = false; });
        toast(errorText(err), 'error');
        if (['write_conflict', 'invalid_status', 'not_found'].includes(err.code)) { closeDrawer(); loadAll(); }
      }
    }));
  }

  async function refreshStats() {
    try { data.stats = await api('/api/admin/stats'); } catch { /* overview refreshes on next load */ }
  }

  /* ---------- Requests (orders) ---------- */

  const orderProgram = (order) => (order.service_id && order.service_title ? order.service_title : t('admin.orderNoProgram'));

  function filteredOrders() {
    const q = ui.orderQ.trim().toLowerCase();
    return data.orders.filter((order) => {
      if (ui.orderStatus !== 'all' && order.status !== ui.orderStatus) return false;
      if (!q) return true;
      const children = (order.participants ?? []).map((child) => `${child.name} ${child.age}`).join(' ');
      return [order.name, order.phone, children, order.service_title, order.comment]
        .filter((value) => value != null && value !== '').join(' ').toLowerCase().includes(q);
    });
  }

  function orderCard(order) {
    const actions = ORDER_ACTIONS[order.status] ?? [];
    const participants = Array.isArray(order.participants) ? order.participants : [];
    const children = participants
      .map((child) => `${esc(child.name)}, ${t('admin.ageShort', { n: child.age })}`)
      .join(' · ');
    return `
    <article class="request-card ${order.status === 'new' ? 'is-new' : ''}">
      <div class="request-head">
        ${orderStatusChip(order.status)}
        ${order.user_id ? `<span class="chip st-confirmed" title="${esc(t('admin.orderLinkedHint'))}">${icon('user')} ${t('admin.orderLinked')}</span>` : ''}
        <time>${fmtDate(order.created_at.slice(0, 10), { year: true })}</time>
      </div>
      <div class="request-person">
        <span class="avatar">${esc(initials(order.name))}</span>
        <div><b>${esc(order.name)}</b><a href="tel:${esc(order.phone.replace(/[^\d+]/g, ''))}">${esc(order.phone)}</a></div>
      </div>
      <div class="request-meta">
        <div class="line"><span>${icon('users')} ${t('admin.thChildren', { n: participants.length })}</span><b>${children || '—'}</b></div>
        <div class="line"><span>${icon('bubble')} ${t('admin.program')}</span><b>${esc(orderProgram(order))}</b></div>
        ${order.comment ? `<p class="request-comment">${esc(order.comment)}</p>` : ''}
        ${order.status === 'confirmed' ? `<p class="form-hint">${icon('checkCircle')} ${t('admin.orderConfirmedNote')}</p>` : ''}
      </div>
      <div class="request-actions">
        ${actions.map((target) => `<button class="btn ${target === 'cancelled' ? 'btn-ghost' : 'btn-primary'} btn-sm" data-order-action="${order.id}" data-order-target="${target}">${
          target === 'contacted' ? t('admin.orderActContact') : target === 'confirmed' ? t('admin.orderActConfirm') : target === 'done' ? t('admin.orderActDone') : t('admin.orderActCancelled')
        }</button>`).join('')}
        ${actions.length ? '' : `<p class="form-hint">${t('admin.orderNoActions')}</p>`}
        <button class="icon-btn danger" data-order-delete="${order.id}" aria-label="${esc(t('admin.orderDeleteTitle'))}">${icon('trash')}</button>
      </div>
    </article>`;
  }

  function ordersHtml() {
    const list = filteredOrders();
    const fresh = data.orders.filter((order) => order.status === 'new').length;
    return `
    <div class="admin-title"><div><h1>${t('admin.ordersTitle')}</h1><p>${t('admin.ordersLead', { n: data.orders.length, new: fresh })}</p></div>
      <button class="btn btn-soft btn-sm" id="orders-refresh">${icon('sparkles')} ${t('admin.refresh')}</button></div>
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="or-q" placeholder="${esc(t('admin.searchOrders'))}" value="${esc(ui.orderQ)}"></div>
    </div>
    <div class="filter-chips" style="margin-bottom:16px">
      ${[['all', t('admin.filterAll')], ...ORDER_STATUS_KEYS.map((key) => [key, orderStatusLabel(key)])].map(([key, label]) =>
        `<button class="filter-chip ${ui.orderStatus === key ? 'active' : ''}" data-order-filter="${key}">${label}</button>`).join('')}
    </div>
    <div class="request-grid">${list.map(orderCard).join('') || `
      <div class="empty-state panel" style="grid-column:1/-1">
        <span class="ic">${icon('inbox')}</span><b>${t('admin.ordersEmptyTitle')}</b><p>${t('admin.ordersEmptyText')}</p>
      </div>`}</div>`;
  }

  function bindOrders() {
    main.querySelector('#orders-refresh')?.addEventListener('click', loadAll);
    const q = main.querySelector('#or-q');
    q?.addEventListener('input', debounce(() => {
      ui.orderQ = q.value;
      const position = q.selectionStart;
      render(false);
      const next = main.querySelector('#or-q');
      next.focus();
      next.setSelectionRange(position, position);
    }, 220));
    main.querySelectorAll('[data-order-filter]').forEach((chip) => chip.addEventListener('click', () => {
      ui.orderStatus = chip.dataset.orderFilter;
      render(false);
    }));
    main.querySelectorAll('[data-order-action]').forEach((button) => button.addEventListener('click', async () => {
      const order = data.orders.find((item) => item.id === button.dataset.orderAction);
      const target = button.dataset.orderTarget;
      if (!order || !target) return;
      if (target === 'cancelled') {
        const ok = await confirmDialog({
          title: t('admin.orderActCancelled'),
          message: t('admin.orderDeleteMessage', { name: order.name }),
          confirmLabel: t('admin.orderActCancelled'),
          danger: true,
        });
        if (!ok) return;
      }
      button.disabled = true;
      try {
        const result = await api(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: { status: target } });
        order.status = result.status;
        toast(t('admin.orderStatusUpdated', { status: orderStatusLabel(target).toLowerCase() }), 'success');
        refreshStats();
        render(false);
      } catch (err) {
        button.disabled = false;
        toast(errorText(err), 'error');
        if (['write_conflict', 'invalid_status', 'not_found'].includes(err.code)) loadAll();
      }
    }));
    main.querySelectorAll('[data-order-delete]').forEach((button) => button.addEventListener('click', async () => {
      const order = data.orders.find((item) => item.id === button.dataset.orderDelete);
      if (!order) return;
      const ok = await confirmDialog({
        title: t('admin.orderDeleteTitle'),
        message: t('admin.orderDeleteMessage', { name: order.name }),
        confirmLabel: t('admin.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/orders/${order.id}`, { method: 'DELETE' });
        data.orders = data.orders.filter((item) => item.id !== order.id);
        toast(t('admin.orderDeleted'), 'success');
        refreshStats();
        render(false);
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }));
  }

  /* ---------- Showcase (gallery) ---------- */

  function galleryHtml() {
    const list = data.gallery;
    return `
    <div class="admin-title"><div><h1>${t('admin.galleryAdminTitle')}</h1><p>${t('admin.galleryAdminLead', { n: list.length })}</p></div>
      <button class="btn btn-primary btn-sm" id="gallery-new">${icon('plus')} ${t('admin.newGallery')}</button></div>
    <div class="showcase-grid">${list.map((item) => `
      <article class="showcase-card ${item.active ? '' : 'is-off'}">
        <div class="showcase-thumb">
          <img src="${image(item.image)}" alt="${esc(item.title)}" loading="lazy">
          <span class="showcase-state">${item.active ? icon('eye') : icon('close')} ${item.active ? t('admin.galleryOn') : t('admin.galleryOff')}</span>
          <span class="showcase-order">${t('admin.galleryOrderLabel', { n: item.sort_order })}</span>
        </div>
        <div class="showcase-body">
          <b>${esc(item.title)}</b>
          <p>${esc(item.description)}</p>
          <div class="showcase-actions">
            <button class="icon-btn" data-gallery-edit="${item.id}" aria-label="${esc(t('admin.galleryFormEdit'))}">${icon('edit')}</button>
            <label class="switch" title="${esc(item.active ? t('admin.galleryOn') : t('admin.galleryOff'))}"><input type="checkbox" data-gallery-active="${item.id}" ${item.active ? 'checked' : ''}><span class="track"></span></label>
            <button class="icon-btn danger" data-gallery-delete="${item.id}" aria-label="${esc(t('admin.galleryDeleteTitle'))}">${icon('trash')}</button>
          </div>
        </div>
      </article>`).join('') || `
      <div class="empty-state panel" style="grid-column:1/-1">
        <span class="ic">${icon('picture')}</span><b>${t('admin.galleryEmptyTitle')}</b><p>${t('admin.galleryEmptyText')}</p>
        <button class="btn btn-primary btn-sm" id="gallery-empty-new">${icon('plus')} ${t('admin.newGallery')}</button>
      </div>`}</div>`;
  }

  function bindGallery() {
    main.querySelector('#gallery-new')?.addEventListener('click', () => openGalleryForm(null));
    main.querySelector('#gallery-empty-new')?.addEventListener('click', () => openGalleryForm(null));
    main.querySelectorAll('[data-gallery-edit]').forEach((button) => button.addEventListener('click', () => {
      openGalleryForm(data.gallery.find((item) => item.id === button.dataset.galleryEdit) ?? null);
    }));
    main.querySelectorAll('[data-gallery-active]').forEach((input) => input.addEventListener('change', async () => {
      const item = data.gallery.find((entry) => entry.id === input.dataset.galleryActive);
      if (!item) return;
      const next = input.checked;
      input.disabled = true;
      try {
        const result = await api(`/api/admin/gallery/${item.id}`, { method: 'PATCH', body: { active: next } });
        Object.assign(item, result);
        syncGallery();
        toast(next ? t('admin.galleryShown') : t('admin.galleryHidden'), 'success');
        render(false);
      } catch (err) {
        input.checked = !next;
        input.disabled = false;
        toast(errorText(err), 'error');
      }
    }));
    main.querySelectorAll('[data-gallery-delete]').forEach((button) => button.addEventListener('click', async () => {
      const item = data.gallery.find((entry) => entry.id === button.dataset.galleryDelete);
      if (!item) return;
      const ok = await confirmDialog({
        title: t('admin.galleryDeleteTitle'),
        message: t('admin.galleryDeleteMessage', { name: item.title }),
        confirmLabel: t('admin.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/gallery/${item.id}`, { method: 'DELETE' });
        data.gallery = data.gallery.filter((entry) => entry.id !== item.id);
        syncGallery();
        toast(t('admin.galleryDeleted'), 'success');
        render(false);
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }));
  }

  function openGalleryForm(item) {
    const editing = Boolean(item);
    const value = item ?? {
      title: '', title_kk: '', title_en: '', description: '', description_kk: '', description_en: '',
      image: 'k-hero', active: true, sort_order: (data.gallery.at(-1)?.sort_order ?? 0) + 1,
    };
    let imageValue = value.image;
    let busy = false;
    const host = openModal({
      title: editing ? t('admin.galleryFormEdit') : t('admin.galleryFormNew'),
      wide: true,
      body: `
      <form id="gallery-form" class="form-grid" novalidate>
        <div class="field full">
          <label>${t('admin.galleryImage')} <span class="form-hint">${t('admin.galleryImageHint')}</span></label>
          <div class="gallery-drop" id="gallery-drop" tabindex="0" role="button">
            <img id="gallery-preview" src="${image(imageValue)}" alt="">
            <div class="gallery-drop-copy">
              <b>${t('admin.galleryUpload')}</b>
              <small id="gallery-drop-note">${t('admin.galleryImageHint')}</small>
            </div>
            <input type="file" id="gallery-file" accept="image/jpeg,image/png,image/webp" hidden>
          </div>
        </div>
        <div class="field full">
          <label>${t('admin.galleryLibrary')}</label>
          <div class="image-picker" id="image-picker">
            ${IMAGES.map((key) => `<button type="button" class="image-option ${imageValue === key ? 'active' : ''}" data-image-key="${key}">
              <img src="${image(key)}" alt=""><span>${t(`admin.${IMAGE_LABELS[key]}`)}</span>
            </button>`).join('')}
          </div>
        </div>
        <div class="field full"><label for="g-title">${t('admin.galleryTitleField')}</label><input class="input" id="g-title" name="title" value="${esc(value.title)}" placeholder="${esc(t('admin.galleryTitlePh'))}" maxlength="80" required></div>
        <div class="field full"><label for="g-desc">${t('admin.galleryDesc')} <span class="form-hint">${t('admin.galleryDescHint')}</span></label><textarea class="input" id="g-desc" name="description" rows="3" placeholder="${esc(t('admin.galleryDescPh'))}" maxlength="600" required>${esc(value.description)}</textarea></div>
        <div class="field"><label for="g-title-kk">${t('admin.fTitleKk')}</label><input class="input" id="g-title-kk" name="title_kk" value="${esc(value.title_kk ?? '')}" maxlength="80"></div>
        <div class="field"><label for="g-title-en">${t('admin.fTitleEn')}</label><input class="input" id="g-title-en" name="title_en" value="${esc(value.title_en ?? '')}" maxlength="80"></div>
        <div class="field full"><label for="g-desc-kk">${t('admin.fDescKk')}</label><textarea class="input" id="g-desc-kk" name="description_kk" rows="2" maxlength="600">${esc(value.description_kk ?? '')}</textarea></div>
        <div class="field full"><label for="g-desc-en">${t('admin.fDescEn')}</label><textarea class="input" id="g-desc-en" name="description_en" rows="2" maxlength="600">${esc(value.description_en ?? '')}</textarea></div>
        <p class="form-hint full">${t('admin.fTranslationsHint')}</p>
        <div class="field"><label for="g-order">${t('admin.fOrder')}</label><input class="input" id="g-order" name="sort_order" type="number" min="0" max="999" value="${value.sort_order}" required></div>
        <div class="field" style="justify-content:end">
          <label class="switch"><input type="checkbox" name="active" ${value.active ? 'checked' : ''}><span class="track"></span> ${t('admin.fShow')}</label>
        </div>
        <p class="form-error full" id="gallery-error" hidden></p>
      </form>`,
      footer: `<button class="btn btn-ghost" data-cancel-form>${t('admin.fCancel')}</button><button class="btn btn-primary" id="gallery-submit">${editing ? t('admin.gallerySave') : t('admin.galleryCreate')} ${icon('check')}</button>`,
    });

    const form = host.querySelector('#gallery-form');
    const error = host.querySelector('#gallery-error');
    const submit = host.querySelector('#gallery-submit');
    const preview = host.querySelector('#gallery-preview');
    const note = host.querySelector('#gallery-drop-note');
    const drop = host.querySelector('#gallery-drop');
    const fileInput = host.querySelector('#gallery-file');

    const paintImage = () => {
      preview.src = image(imageValue);
      host.querySelectorAll('[data-image-key]').forEach((node) => node.classList.toggle('active', node.dataset.imageKey === imageValue));
    };

    const pickFile = () => { if (!busy) fileInput.click(); };
    fileInput.addEventListener('click', (event) => event.stopPropagation());
    drop.addEventListener('click', pickFile);
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickFile(); }
    });
    host.querySelectorAll('[data-image-key]').forEach((button) => button.addEventListener('click', () => {
      imageValue = button.dataset.imageKey;
      note.textContent = t('admin.galleryImageHint');
      paintImage();
    }));
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file || busy) return;
      busy = true;
      drop.classList.add('busy');
      submit.disabled = true;
      note.textContent = t('admin.galleryUploading');
      error.hidden = true;
      try {
        imageValue = await prepareGalleryImage(file);
        note.textContent = t('admin.galleryImageHint');
        paintImage();
      } catch (err) {
        error.textContent = t(`admin.${err.message === 'gallerySizeError' ? 'gallerySizeError' : err.message === 'galleryTypeError' ? 'galleryTypeError' : 'galleryReadError'}`);
        error.hidden = false;
        note.textContent = t('admin.galleryImageHint');
      }
      drop.classList.remove('busy');
      submit.disabled = false;
      busy = false;
    });

    host.querySelector('[data-cancel-form]').addEventListener('click', closeModal);
    submit.addEventListener('click', () => form.requestSubmit());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      const raw = Object.fromEntries(new FormData(form).entries());
      const description = raw.description.trim();
      const title = raw.title.trim();
      if ([...title].length < 3 || [...description].length < 10) {
        error.textContent = t('admin.fInvalid');
        error.hidden = false;
        return;
      }
      const body = {
        title, description, image: imageValue,
        title_kk: raw.title_kk?.trim() || null,
        title_en: raw.title_en?.trim() || null,
        description_kk: raw.description_kk?.trim() || null,
        description_en: raw.description_en?.trim() || null,
        sort_order: Number(raw.sort_order),
        active: form.querySelector('[name="active"]').checked,
      };
      error.hidden = true;
      submit.disabled = true;
      try {
        const result = editing
          ? await api(`/api/admin/gallery/${item.id}`, { method: 'PATCH', body })
          : await api('/api/admin/gallery', { method: 'POST', body });
        if (editing) Object.assign(item, result);
        else data.gallery.push(result);
        data.gallery.sort((a, b) => a.sort_order - b.sort_order);
        syncGallery();
        closeModal();
        toast(editing ? t('admin.galleryUpdated') : t('admin.galleryCreated'), 'success');
        render(false);
      } catch (err) {
        error.textContent = err.code === 'invalid_input' ? t('admin.fInvalid') : errorText(err);
        error.hidden = false;
        submit.disabled = false;
      }
    });
  }

  /* ---------- Comments ---------- */

  function commentsHtml() {
    const list = [...data.comments].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const published = list.filter((comment) => comment.status === 'published').length;
    return `
    <div class="admin-title"><div><h1>${t('admin.commentsTitle')}</h1><p>${t('admin.commentsLead', { total: plural('reviews', list.length), published })}</p></div></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${t('admin.thParent')}</th><th>${t('admin.thRating')}</th><th>${t('admin.thReview')}</th><th>${t('admin.thProgram')}</th><th>${t('admin.thDate')}</th><th>${t('admin.thOnSite')}</th>${editor ? `<th style="text-align:right">${t('admin.thActions')}</th>` : ''}</tr></thead>
      <tbody>${list.map((comment) => `
        <tr>
          <td><div class="cell-main"><b>${esc(comment.author_name)}</b><small>${esc(comment.author_email)}</small></div></td>
          <td><span class="stars" style="white-space:nowrap">${icon('star').repeat(Math.max(1, Math.min(5, Number(comment.rating) || 0)))}</span></td>
          <td style="max-width:420px;min-width:220px">
            <div style="font-size:13px;line-height:1.55;color:var(--body)">${esc(comment.body)}</div>
            ${comment.reply_body ? `<div style="margin-top:10px;padding-left:10px;border-left:3px solid var(--site-accent)">
              <span class="form-hint" style="display:block;margin-bottom:2px">${icon('heart')} ${t('admin.replyByStudio')}${comment.reply_author ? ` · ${esc(comment.reply_author)}` : ''}</span>
              <p style="font-size:13px;line-height:1.55;color:var(--deep)">${esc(comment.reply_body)}</p>
            </div>` : ''}
            <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-reply="${comment.id}">${icon('bubble')} ${comment.reply_body ? t('admin.replyEdit') : t('admin.replyAdd')}</button>
          </td>
          <td>${commentTitle(comment) ? esc(commentTitle(comment)) : `<span style="color:var(--site-muted)">${t('admin.aboutStudio')}</span>`}</td>
          <td style="color:var(--site-muted);white-space:nowrap">${fmtDate(comment.created_at.slice(0, 10), { year: true })}</td>
          <td>${editor
            ? `<label class="switch"><input type="checkbox" data-comment-active="${comment.id}" ${comment.status === 'published' ? 'checked' : ''}><span class="track"></span></label>`
            : comment.status === 'published'
              ? `<span class="chip st-confirmed">${t('admin.commentLive')}</span>`
              : `<span class="chip st-cancelled">${t('admin.commentHidden')}</span>`}</td>
          ${editor ? `<td><div class="actions"><button class="icon-btn danger" data-comment-delete="${comment.id}" aria-label="${esc(t('admin.deleteComment', { name: comment.author_name }))}">${icon('trash')}</button></div></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${editor ? 7 : 6}"><div class="empty-state" style="padding:32px"><span class="ic">${icon('star')}</span><b>${t('admin.noCommentsTitle')}</b><p>${t('admin.noCommentsText')}</p></div></td></tr>`}</tbody>
    </table></div>`;
  }

  function bindComments() {
    main.querySelectorAll('[data-comment-active]').forEach((input) => input.addEventListener('change', async () => {
      const comment = data.comments.find((item) => item.id === input.dataset.commentActive);
      if (!comment) return;
      const status = input.checked ? 'published' : 'hidden';
      input.disabled = true;
      try {
        await api(`/api/admin/comments/${comment.id}`, { method: 'PATCH', body: { status } });
        comment.status = status;
        toast(status === 'published' ? t('admin.shownToast') : t('admin.hiddenToast'), 'success');
        render(false);
      } catch (err) {
        input.checked = !input.checked;
        toast(errorText(err), 'error');
        input.disabled = false;
      }
    }));
    main.querySelectorAll('[data-reply]').forEach((button) => button.addEventListener('click', () => {
      const comment = data.comments.find((item) => item.id === button.dataset.reply);
      if (comment) openReplyForm(comment);
    }));
    main.querySelectorAll('[data-comment-delete]').forEach((button) => button.addEventListener('click', async () => {
      const comment = data.comments.find((item) => item.id === button.dataset.commentDelete);
      if (!comment) return;
      const ok = await confirmDialog({
        title: t('admin.deleteCommentTitle'),
        message: t('admin.deleteCommentMessage', { name: comment.author_name }),
        confirmLabel: t('admin.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/comments/${comment.id}`, { method: 'DELETE' });
        data.comments = data.comments.filter((item) => item.id !== comment.id);
        toast(t('admin.deleted'), 'success');
        render();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }));
  }

  function openReplyForm(comment) {
    const host = openModal({
      title: t('admin.replyTitle'),
      body: `
      <form id="reply-form" novalidate>
        <div class="field">
          <label for="reply-body">${t('admin.replyLabel')}</label>
          <textarea class="input" id="reply-body" name="reply" rows="4" maxlength="600" placeholder="${esc(t('admin.replyPlaceholder'))}">${esc(comment.reply_body ?? '')}</textarea>
          <span class="form-hint">${t('admin.replyHint')}</span>
        </div>
        <p class="form-error" id="reply-error" hidden></p>
      </form>`,
      footer: `${comment.reply_body ? `<button class="btn btn-ghost" data-reply-remove>${icon('trash')} ${t('admin.replyDelete')}</button>` : ''}<button class="btn btn-ghost" data-cancel-form>${t('admin.fCancel')}</button><button class="btn btn-primary" id="reply-submit">${t('admin.replySave')} ${icon('check')}</button>`,
    });
    const form = host.querySelector('#reply-form');
    const field = host.querySelector('#reply-body');
    const error = host.querySelector('#reply-error');
    const submit = host.querySelector('#reply-submit');
    const fail = (message) => { error.textContent = message; error.hidden = false; submit.disabled = false; };

    host.querySelector('[data-cancel-form]').addEventListener('click', closeModal);
    submit.addEventListener('click', () => form.requestSubmit());
    host.querySelector('[data-reply-remove]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: t('admin.replyDeleteTitle'),
        message: t('admin.replyDeleteMessage', { name: comment.author_name }),
        confirmLabel: t('admin.delete'),
        danger: true,
      });
      if (!ok) return;
      submit.disabled = true;
      try {
        const result = await api(`/api/admin/comments/${comment.id}/reply`, { method: 'PATCH', body: { reply: '' } });
        Object.assign(comment, { reply_body: result.reply_body, reply_by: result.reply_by, replied_at: result.replied_at, reply_author: result.reply_author });
        closeModal();
        toast(t('admin.replyRemoved'), 'success');
        render(false);
      } catch (err) {
        fail(errorText(err));
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const reply = field.value.trim();
      error.hidden = true;
      if (reply.length < 3) { fail(t('admin.replyInvalid')); field.focus(); return; }
      submit.disabled = true;
      try {
        const result = await api(`/api/admin/comments/${comment.id}/reply`, { method: 'PATCH', body: { reply } });
        Object.assign(comment, { reply_body: result.reply_body, reply_by: result.reply_by, replied_at: result.replied_at, reply_author: result.reply_author });
        closeModal();
        toast(t('admin.replySaved'), 'success');
        render(false);
      } catch (err) {
        fail(err.status === 400 ? t('admin.replyInvalid') : errorText(err));
      }
    });
    field.focus();
  }

  /* ---------- Services ---------- */

  function servicesHtml() {
    const q = ui.serviceQ.trim().toLowerCase();
    const list = data.services.filter((service) => !q || `${serviceTitle(service)} ${service.title} ${service.title_kk ?? ''} ${service.title_en ?? ''} ${service.category} ${categoryLabel(service.category)}`.toLowerCase().includes(q));
    return `
    <div class="admin-title"><div><h1>${t('admin.servicesTitle')}</h1><p>${t('admin.servicesLead', { n: data.services.length })}</p></div>
      ${editor ? `<button class="btn btn-primary btn-sm" id="service-new">${icon('plus')} ${t('admin.newService')}</button>` : ''}</div>
    <div class="toolbar"><div class="search">${icon('search')}<input class="input" id="sv-q" placeholder="${esc(t('admin.searchServices'))}" value="${esc(ui.serviceQ)}"></div></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${t('admin.thService')}</th><th>${t('admin.thCategory')}</th><th>${t('admin.thDuration')}</th><th>${t('admin.thPrice')}</th><th>${t('admin.thPopular')}</th><th>${t('admin.thInCatalog')}</th>${editor ? `<th style="text-align:right">${t('admin.thActions')}</th>` : ''}</tr></thead>
      <tbody>${list.map((service) => {
        const title = serviceTitle(service);
        return `
        <tr>
          <td><div style="display:flex;gap:12px;align-items:center"><img src="${image(service.image)}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:12px"><div class="cell-main"><b>${esc(title)}</b><small>${t('admin.order', { n: service.sort_order })}</small></div></div></td>
          <td>${esc(categoryLabel(service.category))}</td>
          <td style="white-space:nowrap">${fmtDuration(service.duration_min)}</td>
          <td style="white-space:nowrap">${fmtPrice(service.price)}</td>
          <td>${service.popular ? `<span class="chip st-pending">${icon('star')} ${t('admin.hit')}</span>` : '<span style="color:var(--site-muted)">—</span>'}</td>
          <td>${editor
            ? `<label class="switch"><input type="checkbox" data-active="${service.id}" ${service.active ? 'checked' : ''}><span class="track"></span></label>`
            : service.active
              ? `<span class="chip st-confirmed">${t('admin.serviceOn')}</span>`
              : `<span class="chip st-cancelled">${t('admin.serviceOff')}</span>`}</td>
          ${editor ? `<td><div class="actions">
            <button class="icon-btn" data-edit="${service.id}" aria-label="${esc(t('admin.editService', { name: title }))}">${icon('edit')}</button>
            <button class="icon-btn danger" data-delete="${service.id}" aria-label="${esc(t('admin.deleteService', { name: title }))}">${icon('trash')}</button>
          </div></td>` : ''}
        </tr>`; }).join('') || `<tr><td colspan="${editor ? 7 : 6}"><div class="empty-state" style="padding:32px"><span class="ic">${icon('bubble')}</span><b>${t('admin.noServicesTitle')}</b><p>${t('admin.noServicesText')}</p></div></td></tr>`}</tbody>
    </table></div>`;
  }

  function bindServices() {
    const q = main.querySelector('#sv-q');
    q?.addEventListener('input', debounce(() => {
      ui.serviceQ = q.value;
      const position = q.selectionStart;
      render();
      const next = main.querySelector('#sv-q');
      next.focus();
      next.setSelectionRange(position, position);
    }, 220));
    main.querySelector('#service-new')?.addEventListener('click', () => openServiceForm(null));
    main.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
      openServiceForm(data.services.find((service) => service.id === button.dataset.edit));
    }));
    main.querySelectorAll('[data-active]').forEach((input) => input.addEventListener('change', async () => {
      const service = data.services.find((item) => item.id === input.dataset.active);
      if (!service) return;
      const next = input.checked;
      input.disabled = true;
      try {
        const result = await api(`/api/admin/services/${service.id}`, { method: 'PATCH', body: { active: next } });
        Object.assign(service, result);
        toast(next ? t('admin.serviceShown') : t('admin.serviceHidden'), 'success');
        reloadServices();
      } catch (err) {
        input.checked = !next;
        toast(errorText(err), 'error');
      }
      input.disabled = false;
    }));
    main.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
      const service = data.services.find((item) => item.id === button.dataset.delete);
      if (!service) return;
      const ok = await confirmDialog({
        title: t('admin.deleteServiceTitle'),
        message: t('admin.deleteServiceMessage', { name: serviceTitle(service) }),
        confirmLabel: t('admin.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/services/${service.id}`, { method: 'DELETE' });
        data.services = data.services.filter((item) => item.id !== service.id);
        toast(t('admin.serviceDeleted'), 'success');
        reloadServices();
        render();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }));
  }

  function openServiceForm(service) {
    const editing = Boolean(service);
    const value = service ?? { title: '', title_kk: '', title_en: '', category: CATEGORIES[0], description: '', description_kk: '', description_en: '', duration_min: 60, price: 2500, image: 'k-bubbles', popular: false, active: true, sort_order: (data.services.at(-1)?.sort_order ?? 0) + 1 };
    const host = openModal({
      title: editing ? t('admin.formEdit') : t('admin.formNew'),
      wide: true,
      body: `
      <form id="service-form" class="form-grid" novalidate>
        <div class="field full"><label for="s-title">${t('admin.fTitle')}</label><input class="input" id="s-title" name="title" value="${esc(value.title)}" placeholder="${esc(t('admin.fTitlePh'))}" required></div>
        <div class="field"><label for="s-category">${t('admin.fCategory')}</label><select class="input" id="s-category" name="category">${CATEGORIES.map((category) => `<option value="${esc(category)}" ${value.category === category ? 'selected' : ''}>${esc(categoryLabel(category))}</option>`).join('')}</select></div>
        <div class="field"><label for="s-image">${t('admin.fImage')}</label><select class="input" id="s-image" name="image">${IMAGES.map((key) => `<option value="${key}" ${value.image === key ? 'selected' : ''}>${t(`admin.${IMAGE_LABELS[key]}`)}</option>`).join('')}</select></div>
        <div class="field full"><label for="s-desc">${t('admin.fDesc')} <span class="form-hint">${t('admin.fDescHint')}</span></label><textarea class="input" id="s-desc" name="description" rows="3" placeholder="${esc(t('admin.fDescPh'))}" required>${esc(value.description)}</textarea></div>
        <div class="field"><label for="s-title-kk">${t('admin.fTitleKk')}</label><input class="input" id="s-title-kk" name="title_kk" value="${esc(value.title_kk ?? '')}"></div>
        <div class="field"><label for="s-title-en">${t('admin.fTitleEn')}</label><input class="input" id="s-title-en" name="title_en" value="${esc(value.title_en ?? '')}"></div>
        <div class="field full"><label for="s-desc-kk">${t('admin.fDescKk')}</label><textarea class="input" id="s-desc-kk" name="description_kk" rows="2">${esc(value.description_kk ?? '')}</textarea></div>
        <div class="field full"><label for="s-desc-en">${t('admin.fDescEn')}</label><textarea class="input" id="s-desc-en" name="description_en" rows="2">${esc(value.description_en ?? '')}</textarea></div>
        <p class="form-hint full">${t('admin.fTranslationsHint')}</p>
        <div class="field"><label for="s-duration">${t('admin.fDuration')} <span class="form-hint">${t('admin.fDurationHint')}</span></label><input class="input" id="s-duration" name="duration_min" type="number" min="15" max="240" step="5" value="${value.duration_min}" required></div>
        <div class="field"><label for="s-price">${t('admin.fPrice')} <span class="form-hint">(KZT)</span></label><input class="input" id="s-price" name="price" type="number" min="0" max="100000" step="100" value="${value.price}" required></div>
        <div class="field"><label for="s-order">${t('admin.fOrder')}</label><input class="input" id="s-order" name="sort_order" type="number" min="0" max="999" value="${value.sort_order}" required></div>
        <div class="field" style="justify-content:end;gap:12px">
          <label class="switch"><input type="checkbox" name="popular" ${value.popular ? 'checked' : ''}><span class="track"></span> ${t('admin.fPopular')}</label>
          <label class="switch"><input type="checkbox" name="active" ${value.active ? 'checked' : ''}><span class="track"></span> ${t('admin.fShow')}</label>
        </div>
        <p class="form-error full" id="service-error" hidden></p>
      </form>`,
      footer: `<button class="btn btn-ghost" data-cancel-form>${t('admin.fCancel')}</button><button class="btn btn-primary" id="service-submit">${editing ? t('admin.fSave') : t('admin.fCreate')} ${icon('check')}</button>`,
    });
    host.querySelector('[data-cancel-form]').addEventListener('click', closeModal);
    host.querySelector('#service-submit').addEventListener('click', () => host.querySelector('#service-form').requestSubmit());
    host.querySelector('#service-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = host.querySelector('#service-error');
      const submit = host.querySelector('#service-submit');
      const raw = Object.fromEntries(new FormData(form).entries());
      const body = {
        title: raw.title, category: raw.category, description: raw.description, image: raw.image,
        title_kk: raw.title_kk?.trim() || null,
        title_en: raw.title_en?.trim() || null,
        description_kk: raw.description_kk?.trim() || null,
        description_en: raw.description_en?.trim() || null,
        duration_min: Number(raw.duration_min), price: Number(raw.price), sort_order: Number(raw.sort_order),
        popular: form.querySelector('[name="popular"]').checked, active: form.querySelector('[name="active"]').checked,
      };
      error.hidden = true;
      submit.disabled = true;
      try {
        const result = editing
          ? await api(`/api/admin/services/${service.id}`, { method: 'PATCH', body })
          : await api('/api/admin/services', { method: 'POST', body });
        if (editing) Object.assign(service, result);
        else data.services.push(result);
        data.services.sort((a, b) => a.sort_order - b.sort_order);
        closeModal();
        toast(editing ? t('admin.serviceUpdated') : t('admin.serviceCreated'), 'success');
        reloadServices();
        render();
      } catch (err) {
        error.textContent = err.code === 'invalid_input' ? t('admin.fInvalid') : errorText(err);
        error.hidden = false;
        submit.disabled = false;
      }
    });
  }

  /* ---------- Clients ---------- */

  function clientsHtml() {
    const q = ui.clientQ.trim().toLowerCase();
    const list = data.users
      .filter((user) => ui.clientRole === 'all' || user.role === ui.clientRole)
      .filter((user) => !q || `${user.name} ${user.email} ${user.phone ?? ''}`.toLowerCase().includes(q));
    return `
    <div class="admin-title"><div><h1>${t('admin.clientsTitle')}</h1><p>${t('admin.clientsLead', { n: data.users.length })}</p></div></div>
    <div class="toolbar"><div class="search">${icon('search')}<input class="input" id="cl-q" placeholder="${esc(t('admin.searchClients'))}" value="${esc(ui.clientQ)}"></div></div>
    <div class="filter-chips" style="margin-bottom:16px">
      ${[['all', t('admin.filterAll')], ...ROLES.map((role) => [role, roleLabel(role)])].map(([key, label]) =>
        `<button class="filter-chip ${ui.clientRole === key ? 'active' : ''}" data-role-filter="${key}">${label}</button>`).join('')}
    </div>
    ${editor ? `<p class="form-hint" style="margin:0 0 14px">${t('admin.roleHint')}</p>` : `<p class="form-hint" style="margin:0 0 14px">${t('admin.viewOnly')}</p>`}
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${t('admin.thParent')}</th><th>${t('admin.phone')}</th><th>${t('admin.thRole')}</th><th>${t('admin.thBookings')}</th><th>${t('admin.thVisits')}</th>${owner ? `<th>${t('admin.thSpent')}</th>` : ''}<th>${t('admin.thSince')}</th></tr></thead>
      <tbody>${list.map((user) => `
        <tr>
          <td><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:13px;background:linear-gradient(135deg,var(--site-accent),var(--violet));color:#fff;flex:none">${esc(initials(user.name))}</span><div class="cell-main"><b>${esc(user.name)}</b><small>${esc(user.email)}</small></div></div></td>
          <td style="white-space:nowrap">${user.phone ? esc(user.phone) : '<span style="color:var(--site-muted)">—</span>'}</td>
          <td>
            ${editor && user.id !== state.user.id && user.role !== 'owner' ? `<select class="input role-select" data-role-user="${user.id}" aria-label="${esc(t('admin.changeRole'))}">
              ${ASSIGNABLE_ROLES.map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${roleLabel(role)}</option>`).join('')}
            </select>` : roleChip(user.role)}
          </td>
          <td>${user.bookings_count}</td><td>${user.visits}</td>
          ${owner ? `<td style="white-space:nowrap">${fmtPrice(user.spent)}</td>` : ''}
          <td style="color:var(--site-muted);white-space:nowrap">${fmtDate(user.created_at.slice(0, 10), { year: true })}</td>
        </tr>`).join('') || `<tr><td colspan="${owner ? 7 : 6}"><div class="empty-state" style="padding:32px"><span class="ic">${icon('users')}</span><b>${t('admin.noClientsTitle')}</b><p>${t('admin.noClientsText')}</p></div></td></tr>`}</tbody>
    </table></div>`;
  }

  function bindClients() {
    const q = main.querySelector('#cl-q');
    q?.addEventListener('input', debounce(() => {
      ui.clientQ = q.value;
      const position = q.selectionStart;
      render();
      const next = main.querySelector('#cl-q');
      next.focus();
      next.setSelectionRange(position, position);
    }, 220));
    main.querySelectorAll('[data-role-filter]').forEach((button) => button.addEventListener('click', () => {
      ui.clientRole = button.dataset.roleFilter;
      render();
    }));
    main.querySelectorAll('[data-role-user]').forEach((select) => select.addEventListener('change', async () => {
      const user = data.users.find((item) => item.id === select.dataset.roleUser);
      const role = select.value;
      if (!user || !ASSIGNABLE_ROLES.includes(role) || role === user.role) return;
      const ok = await confirmDialog({
        title: t('admin.roleChangeTitle'),
        message: t('admin.roleChangeMessage', { name: user.name, role: roleLabel(role) }),
        confirmLabel: t('admin.roleChangeConfirm'),
      });
      if (!ok) { select.value = user.role; return; }
      select.disabled = true;
      try {
        const updated = await api(`/api/admin/users/${user.id}/role`, { method: 'PATCH', body: { role } });
        user.role = updated.role;
        toast(t('admin.roleChanged', { name: user.name }), 'success');
        render();
      } catch (err) {
        if (err.code === 'role_owner_locked') toast(t('admin.roleOwnerLocked'), 'error');
        else if (err.status === 403) toast(t('admin.roleOwnerOnly'), 'error');
        else toast(errorText(err), 'error');
        select.value = user.role;
        select.disabled = false;
      }
    }));
  }

  /* ---------- Render ---------- */

  function render(scrollTop = true, keepDrawer = false) {
    if (!ui.loaded) return;
    if (!keepDrawer) closeDrawer();
    if (ui.tab === 'overview') {
      main.innerHTML = overviewHtml();
      main.querySelector('#refresh-all')?.addEventListener('click', loadAll);
      bindOpenRows();
    } else if (ui.tab === 'bookings') {
      main.innerHTML = bookingsHtml();
      bindBookings();
    } else if (ui.tab === 'orders') {
      main.innerHTML = ordersHtml();
      bindOrders();
    } else if (ui.tab === 'comments') {
      main.innerHTML = commentsHtml();
      bindComments();
    } else if (ui.tab === 'services') {
      main.innerHTML = servicesHtml();
      bindServices();
    } else if (ui.tab === 'gallery') {
      main.innerHTML = galleryHtml();
      bindGallery();
    } else {
      main.innerHTML = clientsHtml();
      bindClients();
    }
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  loadAll();
  return closeDrawer;
}
