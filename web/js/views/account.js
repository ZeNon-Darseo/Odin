import { api, errorText } from '../api.js';
import { esc, icon, image, fmtPrice, fmtDuration, fmtDate, statusChip, orderStatusChip, paymentLabel, paymentIcon, toast, confirmDialog, bindPasswordToggles, reveal } from '../ui.js';
import { t, plural, serviceTitle } from '../i18n.js';
import { isStaff } from '../roles.js';

const moscowToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

const bookingTitle = (booking, services) => {
  const service = (services ?? []).find((item) => item.id === booking.service_id);
  return service ? serviceTitle(service) : booking.service_title;
};

const bookingChildren = (booking) => (Array.isArray(booking.participants) ? booking.participants : [])
  .map((child) => `${esc(child.name)}, ${plural('years', child.age)}`)
  .join(' · ');

export function accountView(state) {
  const user = state.user;
  return `
  <header class="page-head">
    <div class="wrap">
      <nav class="crumbs"><a href="/">${t('nav.home')}</a>${icon('chevronDown')}<span>${t('account.crumb')}</span></nav>
      <h1>${t('account.title')}</h1>
      <p>${t('account.lead')}</p>
    </div>
  </header>
  <div class="wrap account-grid">
    <aside class="panel profile-card">
      <div class="who">
        <span class="avatar">${esc(initials(user.name))}</span>
        <div><b id="profile-name">${esc(user.name)}</b><small>${esc(user.email)}</small></div>
      </div>
      <form id="profile-form" class="form-grid" style="grid-template-columns:1fr" novalidate>
        <div class="field"><label for="p-name">${t('account.yourName')}</label><input class="input" id="p-name" name="name" value="${esc(user.name)}" autocomplete="name" required></div>
        <div class="field"><label for="p-phone">${t('account.phone')}</label><input class="input" id="p-phone" name="phone" type="tel" value="${esc(user.phone ?? '')}" placeholder="${esc(t('account.phonePh'))}" autocomplete="tel"></div>
        <p class="form-error" id="profile-error" hidden></p>
        <button class="btn btn-soft btn-block" type="submit" id="profile-submit">${t('account.save')}</button>
      </form>
      <details class="password-details">
        <summary>${icon('shield')} ${t('account.changePassword')}</summary>
        <form id="password-form" style="display:grid;gap:14px;margin-top:16px" novalidate>
          <div class="field"><label for="pw-current">${t('account.currentPassword')}</label>
            <div class="password-wrap"><input class="input" id="pw-current" name="current" type="password" autocomplete="current-password" required><button type="button" class="icon-btn" data-toggle-password aria-label="${esc(t('auth.showPassword'))}">${icon('eye')}</button></div>
          </div>
          <div class="field"><label for="pw-next">${t('account.newPassword')}</label>
            <div class="password-wrap"><input class="input" id="pw-next" name="password" type="password" autocomplete="new-password" placeholder="${esc(t('account.passwordPh'))}" required><button type="button" class="icon-btn" data-toggle-password aria-label="${esc(t('auth.showPassword'))}">${icon('eye')}</button></div>
          </div>
          <p class="form-error" id="password-error" hidden></p>
          <p class="form-hint">${t('account.passwordHint')}</p>
          <button class="btn btn-soft btn-block" type="submit" id="password-submit">${t('account.updatePassword')}</button>
        </form>
      </details>
      ${isStaff(user) ? `<a class="btn btn-ghost btn-block" href="/admin/">${icon(user.role === 'owner' ? 'crown' : 'shield')} ${t('account.adminPanel')}</a>` : ''}
      <button class="btn btn-ghost btn-block" id="logout-btn">${icon('logout')} ${t('account.logout')}</button>
    </aside>
    <section id="visits">
      <div class="skeleton" style="height:120px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:120px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:120px"></div>
    </section>
  </div>`;
}

function bookingRow(booking, { cancellable, services }) {
  return `
  <article class="booking-row" data-booking="${booking.id}">
    <img src="${image(booking.service_image)}" alt="">
    <div class="info">
      <b>${esc(bookingTitle(booking, services))}</b>
      <div class="when">
        <span>${icon('calendar')} ${fmtDate(booking.booking_date, { weekday: true, year: true })}</span>
        <span>${icon('clock')} ${booking.slot}${booking.duration_min ? ` · ${fmtDuration(booking.duration_min)}` : ''}</span>
        ${bookingChildren(booking) ? `<span>${icon('users')} ${bookingChildren(booking)}</span>` : ''}
        ${booking.payment_method ? `<span>${icon(paymentIcon(booking.payment_method))} ${esc(paymentLabel(booking.payment_method))}</span>` : ''}
      </div>
      ${booking.comment ? `<small class="form-hint">${esc(booking.comment)}</small>` : ''}
    </div>
    <div class="side">
      ${statusChip(booking.status)}
      <span class="price" style="font-size:16px">${fmtPrice(booking.price)}</span>
      ${cancellable ? `<button class="btn btn-ghost btn-sm" data-cancel="${booking.id}">${t('account.cancel')}</button>` : ''}
    </div>
  </article>`;
}

export function mountAccount(root, state, { navigate, setUser }) {
  const visits = root.querySelector('#visits');
  let bookings = [];
  let orders = [];
  const today = moscowToday();

  function requestCard(order) {
    const waiting = order.status === 'contacted';
    const children = (Array.isArray(order.participants) ? order.participants : [])
      .map((child) => `${esc(child.name)}, ${plural('years', child.age)}`)
      .join(' · ');
    return `
    <article class="my-request ${waiting ? 'needs-confirm' : ''}" data-my-request="${order.id}">
      <div class="my-request-head">${orderStatusChip(order.status)}<time>${fmtDate(order.created_at.slice(0, 10), { year: true })}</time></div>
      <div class="my-request-body">
        <div class="line"><span>${icon('users')} ${t('account.requestChildren')}</span><b>${children || '—'}</b></div>
        <div class="line"><span>${icon('bubble')} ${t('account.requestProgram')}</span><b>${esc(order.service_title || t('account.orderNoProgram'))}</b></div>
        ${order.comment ? `<p class="my-request-comment">${esc(order.comment)}</p>` : ''}
      </div>
      ${waiting ? `
        <div class="confirm-banner">
          <span class="confirm-orb">${icon('bell')}</span>
          <div><b>${t('account.confirmTitle')}</b><p>${t('account.confirmText')}</p></div>
          <button class="btn btn-primary btn-sm" data-confirm-order="${order.id}">${t('account.confirmAction')} ${icon('check')}</button>
        </div>` : ''}
      ${order.status === 'confirmed' ? `<p class="my-request-note">${icon('checkCircle')} ${t('account.confirmedNote')}</p>` : ''}
    </article>`;
  }

  function requestsHtml() {
    return `
      <div class="section-head" id="requests" style="margin-bottom:18px">
        <div><span class="eyebrow">${icon('inbox')} ${t('account.requestsEyebrow')}</span><h2 style="font-size:24px">${t('account.requestsTitle')}</h2></div>
      </div>
      ${orders.length ? `<div class="my-requests">${orders.map(requestCard).join('')}</div>` : `
        <div class="panel empty-state" style="padding:calc(var(--gap)*1.2)">
          <span class="ic">${icon('inbox')}</span>
          <b>${t('account.requestsEmptyTitle')}</b>
          <p>${t('account.requestsEmptyText')}</p>
        </div>`}`;
  }

  function renderVisits() {
    const upcoming = bookings
      .filter((booking) => ['pending', 'confirmed'].includes(booking.status) && booking.booking_date >= today)
      .sort((a, b) => (a.booking_date + a.slot).localeCompare(b.booking_date + b.slot));
    const history = bookings
      .filter((booking) => !upcoming.includes(booking))
      .sort((a, b) => (b.booking_date + b.slot).localeCompare(a.booking_date + a.slot));
    visits.innerHTML = `
      ${requestsHtml()}
      <div class="section-head" style="margin:calc(var(--gap)*1.6) 0 18px">
        <div><span class="eyebrow">${icon('calendar')} ${t('account.upcomingEyebrow')}</span><h2 style="font-size:24px">${upcoming.length ? t('account.upcomingCount', { n: upcoming.length }) : t('account.nothingPlanned')}</h2></div>
        <a class="btn btn-primary btn-sm" href="/booking/">${icon('plus')} ${t('account.newBooking')}</a>
      </div>
      ${upcoming.length ? `<div class="booking-list">${upcoming.map((booking) => bookingRow(booking, { cancellable: true, services: state.services })).join('')}</div>` : `
        <div class="panel empty-state">
          <span class="ic">${icon('bubble')}</span>
          <b>${t('account.emptyTitle')}</b>
          <p>${t('account.emptyText')}</p>
          <a class="btn btn-primary" href="/booking/">${t('home.ctaBook')} ${icon('arrowRight')}</a>
        </div>`}
      <div class="section-head" style="margin:calc(var(--gap)*1.6) 0 18px">
        <div><span class="eyebrow">${icon('clock')} ${t('account.historyEyebrow')}</span><h2 style="font-size:24px">${t('account.historyTitle')}</h2></div>
      </div>
      ${history.length ? `<div class="booking-list">${history.map((booking) => bookingRow(booking, { cancellable: false, services: state.services })).join('')}</div>` : `
        <div class="panel empty-state" style="padding:calc(var(--gap)*1.4)">
          <span class="ic">${icon('moon')}</span>
          <b>${t('account.historyEmptyTitle')}</b>
          <p>${t('account.historyEmptyText')}</p>
        </div>`}`;
    visits.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', async () => {
      const booking = bookings.find((item) => item.id === button.dataset.cancel);
      if (!booking) return;
      const ok = await confirmDialog({
        title: t('account.cancelTitle'),
        message: t('account.cancelMessage', {
          service: bookingTitle(booking, state.services),
          date: fmtDate(booking.booking_date, { weekday: true }),
          time: booking.slot,
        }),
        confirmLabel: t('account.cancelConfirm'),
        danger: true,
      });
      if (!ok) return;
      button.disabled = true;
      try {
        const result = await api(`/api/bookings/${booking.id}/cancel`, { method: 'POST' });
        booking.status = result.status;
        toast(t('account.cancelled'), 'success');
        renderVisits();
      } catch (err) {
        button.disabled = false;
        toast(errorText(err), 'error');
        if (['not_found', 'write_conflict', 'invalid_status'].includes(err.code)) loadAccount();
      }
    }));
    visits.querySelectorAll('[data-confirm-order]').forEach((button) => button.addEventListener('click', async () => {
      const order = orders.find((item) => item.id === button.dataset.confirmOrder);
      if (!order) return;
      button.disabled = true;
      try {
        const result = await api(`/api/orders/${order.id}/confirm`, { method: 'POST' });
        Object.assign(order, result);
        toast(t('account.confirmSuccess'), 'success');
        window.dispatchEvent(new CustomEvent('aura:orders-changed'));
        renderVisits();
      } catch (err) {
        button.disabled = false;
        toast(errorText(err), 'error');
        if (['not_found', 'write_conflict', 'invalid_status'].includes(err.code)) loadAccount();
      }
    }));
    reveal(visits);
  }

  async function loadAccount() {
    try {
      const [bookingList, orderList] = await Promise.all([api('/api/bookings'), api('/api/orders')]);
      bookings = bookingList;
      orders = Array.isArray(orderList) ? orderList : [];
      renderVisits();
    } catch (err) {
      if (err.status === 401) { setUser(null); navigate('/login/?next=/account/'); return; }
      visits.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('info')}</span><b>${t('account.loadError')}</b><p>${esc(errorText(err))}</p><button class="btn btn-soft" id="retry-visits">${t('account.retry')}</button></div>`;
      visits.querySelector('#retry-visits').addEventListener('click', loadAccount);
    }
  }

  const profileForm = root.querySelector('#profile-form');
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = root.querySelector('#profile-error');
    const submit = root.querySelector('#profile-submit');
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = t('account.saving');
    const data = Object.fromEntries(new FormData(profileForm).entries());
    try {
      const result = await api('/api/me', { method: 'PATCH', body: { name: data.name, phone: data.phone || null } });
      setUser(result.user);
      root.querySelector('#profile-name').textContent = result.user.name;
      root.querySelector('.profile-card .avatar').textContent = initials(result.user.name);
      toast(t('account.profileSaved'), 'success');
    } catch (err) {
      if (err.status === 401) { setUser(null); navigate('/login/?next=/account/'); return; }
      error.textContent = errorText(err);
      error.hidden = false;
    }
    submit.disabled = false;
    submit.textContent = t('account.save');
  });

  bindPasswordToggles(root);
  const passwordForm = root.querySelector('#password-form');
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = root.querySelector('#password-error');
    const submit = root.querySelector('#password-submit');
    error.hidden = true;
    const data = Object.fromEntries(new FormData(passwordForm).entries());
    submit.disabled = true;
    submit.textContent = t('account.updating');
    try {
      await api('/api/password', { method: 'POST', body: { current: data.current, password: data.password } });
      passwordForm.reset();
      toast(t('account.passwordUpdated'), 'success');
    } catch (err) {
      if (err.code === 'session_refresh_failed') {
        toast(errorText(err), 'error');
        setUser(null);
        navigate('/login/');
        return;
      }
      if (err.status === 401 && err.code === 'login_required') { setUser(null); navigate('/login/?next=/account/'); return; }
      error.textContent = errorText(err);
      error.hidden = false;
    }
    submit.disabled = false;
    submit.textContent = t('account.updatePassword');
  });

  root.querySelector('#logout-btn').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (err) {
      toast(errorText(err), 'error');
      return;
    }
    setUser(null);
    toast(t('account.loggedOut'), 'info');
    navigate('/');
  });

  const poll = setInterval(async () => {
    if (document.hidden) return;
    try {
      const list = await api('/api/orders');
      if (list.length !== orders.length || list.some((order, index) => order.status !== orders[index]?.status)) {
        orders = list;
        renderVisits();
      }
    } catch { /* the next manual reload reports the failure */ }
  }, 30000);

  loadAccount();
  return () => clearInterval(poll);
}
