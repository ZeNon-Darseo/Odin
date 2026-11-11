import { api, errorText } from '../api.js';
import { esc, icon, image, fmtPrice, fmtDuration, fmtDate, dayLabel, nextDays, toast, reveal } from '../ui.js';
import { t, plural, serviceTitle, categoryLabel } from '../i18n.js';
import { authFormHtml, bindAuthForm } from './auth.js';

const MAX_PARTICIPANTS = 6;

function participantRowHtml() {
  return `
  <div class="party-row" data-party-row>
    <input class="input" name="participant_name" placeholder="${esc(t('booking.childNamePh'))}" aria-label="${esc(t('booking.childName'))}" maxlength="60" required>
    <input class="input party-age" name="participant_age" type="number" min="1" max="17" step="1" inputmode="numeric" placeholder="${esc(t('booking.childAgePh'))}" aria-label="${esc(t('booking.childAge'))}" required>
    <button type="button" class="icon-btn" data-party-remove aria-label="${esc(t('booking.removeChild'))}" title="${esc(t('booking.removeChild'))}">${icon('close')}</button>
  </div>`;
}

export function bookingView(state, params) {
  return `
  <header class="page-head">
    <div class="wrap">
      <nav class="crumbs"><a href="/">${t('nav.home')}</a>${icon('chevronDown')}<span>${t('booking.crumb')}</span></nav>
      <h1>${t('booking.title')}</h1>
      <p>${t('booking.lead')}</p>
    </div>
  </header>
  <div class="wrap wizard" id="wizard"></div>`;
}

export function mountBooking(root, state, { params, navigate, setUser }) {
  const host = root.querySelector('#wizard');
  const days = nextDays(14);
  const wiz = {
    step: params.get('service') && state.services.some((service) => service.id === params.get('service')) ? 2 : 1,
    serviceId: params.get('service') || null,
    date: days[0],
    slot: null,
    slots: null,
    loading: false,
    authMode: 'login',
    done: null,
    error: '',
  };

  const service = () => state.services.find((item) => item.id === wiz.serviceId) || null;

  async function loadSlots() {
    wiz.loading = true;
    wiz.slots = null;
    render();
    try {
      const result = await api(`/api/availability?service_id=${wiz.serviceId}&date=${wiz.date}`);
      wiz.slots = result.slots;
    } catch (err) {
      wiz.slots = [];
      wiz.error = errorText(err);
    }
    wiz.loading = false;
    render();
  }

  function stepsBar() {
    const labels = [t('booking.step1'), t('booking.step2'), t('booking.step3')];
    return `<div class="steps">${labels.map((label, index) => {
      const n = index + 1;
      const cls = wiz.done ? 'done' : wiz.step === n ? 'active' : wiz.step > n ? 'done' : '';
      return `${index ? '<span class="step-dot"><span class="bar"></span></span>' : ''}
        <span class="step-dot ${cls}"><span class="n">${cls === 'done' ? icon('check') : n}</span>${label}</span>`;
    }).join('')}</div>`;
  }

  function stepOne() {
    return `
    <div class="panel">
      <h3>${t('booking.chooseProgram')}</h3>
      <div class="pick-list">
        ${state.services.map((item) => `
          <button class="pick ${wiz.serviceId === item.id ? 'selected' : ''}" data-pick="${item.id}">
            <img src="${image(item.image)}" alt="">
            <span class="t"><b>${esc(serviceTitle(item))}</b><small>${esc(categoryLabel(item.category))} · ${fmtDuration(item.duration_min)}</small></span>
            <span class="p">${fmtPrice(item.price)}</span>
          </button>`).join('')}
      </div>
    </div>
    <div class="wizard-foot">
      <a class="btn btn-ghost" href="/services/">${icon('arrowLeft')} ${t('booking.backCatalog')}</a>
      <button class="btn btn-primary" data-next ${wiz.serviceId ? '' : 'disabled'}>${t('booking.nextDate')} ${icon('arrowRight')}</button>
    </div>`;
  }

  function stepTwo() {
    const current = service();
    return `
    <div class="panel">
      <h3>${esc(current ? serviceTitle(current) : '')} · ${fmtDuration(current?.duration_min ?? 0)}</h3>
      <div class="date-strip" role="listbox" aria-label="${esc(t('booking.sDate'))}">
        ${days.map((day) => {
          const label = dayLabel(day);
          return `<button class="date-cell ${wiz.date === day ? 'selected' : ''}" data-date="${day}" role="option" aria-selected="${wiz.date === day}">
            <small>${label.top}</small><b>${label.bottom}</b><i>${label.month}</i>
          </button>`;
        }).join('')}
      </div>
      <div class="slot-grid">
        ${wiz.loading ? Array.from({ length: 11 }, () => '<div class="skeleton" style="height:46px"></div>').join('')
          : (wiz.slots ?? []).map((slot) => `<button class="slot ${wiz.slot === slot.time ? 'selected' : ''}" data-slot="${slot.time}" ${slot.available ? '' : 'disabled'}>${slot.time}</button>`).join('')}
      </div>
      ${!wiz.loading && wiz.slots && wiz.slots.every((slot) => !slot.available) ? `<p class="form-hint" style="margin-top:14px">${t('booking.noSlots')}</p>` : ''}
      ${wiz.error ? `<p class="form-error" style="margin-top:14px">${icon('info')} ${esc(wiz.error)}</p>` : ''}
    </div>
    <div class="wizard-foot">
      <button class="btn btn-ghost" data-back>${icon('arrowLeft')} ${t('ui.back')}</button>
      <button class="btn btn-primary" data-next ${wiz.slot ? '' : 'disabled'}>${t('booking.nextConfirm')} ${icon('arrowRight')}</button>
    </div>`;
  }

  function stepThree() {
    const current = service();
    if (!state.user) {
      return `
      <div class="panel">
        <h3>${t('booking.confirmTitle')}</h3>
        <p class="form-hint" style="margin-bottom:18px">${t('booking.confirmHint')}</p>
        <div class="filter-chips" style="margin-bottom:18px">
          <button class="filter-chip ${wiz.authMode === 'login' ? 'active' : ''}" data-auth-mode="login">${t('booking.tabLogin')}</button>
          <button class="filter-chip ${wiz.authMode === 'register' ? 'active' : ''}" data-auth-mode="register">${t('booking.tabRegister')}</button>
        </div>
        <div style="max-width:420px">${authFormHtml(wiz.authMode)}</div>
      </div>
      <div class="wizard-foot"><button class="btn btn-ghost" data-back>${icon('arrowLeft')} ${t('ui.back')}</button></div>`;
    }
    return `
    <div class="panel">
      <h3>${t('booking.summaryTitle')}</h3>
      <div class="summary" style="margin-bottom:22px">
        <div class="line"><span>${t('booking.sProgram')}</span><b>${esc(serviceTitle(current))}</b></div>
        <div class="line"><span>${t('booking.sDate')}</span><b>${fmtDate(wiz.date, { weekday: true })}</b></div>
        <div class="line"><span>${t('booking.sTime')}</span><b>${wiz.slot} · ${fmtDuration(current.duration_min)}</b></div>
        <div class="line"><span>${t('booking.sAddress')}</span><b>${t('booking.address')}</b></div>
        <div class="total"><span>${t('booking.sTotal')}</span><span class="price">${fmtPrice(current.price)}</span></div>
      </div>
      <p class="form-hint" id="book-price-hint" style="margin:-12px 0 20px" hidden>${t('booking.multiChildHint')}</p>
      <form id="book-form" class="form-grid" novalidate>
        <div class="field full party-field">
          <div class="party-head">
            <span class="party-label">${t('booking.childrenLabel')} <span class="form-hint">${t('booking.childrenHint')}</span></span>
            <button type="button" class="btn btn-ghost btn-sm" id="book-add-child">${icon('plus')} ${t('booking.addChild')}</button>
          </div>
          <div class="party-rows" id="book-participants">${participantRowHtml()}</div>
        </div>
        <div class="field full">
          <span class="party-label">${t('payment.label')}</span>
          <div class="pay-options" role="radiogroup" aria-label="${esc(t('payment.label'))}">
            <label class="pay-option">
              <input type="radio" name="payment_method" value="card" checked required>
              <span class="pay-ic">${icon('card')}</span>
              <span class="pay-copy"><b>${t('payment.card')}</b><small>${t('payment.cardHint')}</small></span>
              <span class="pay-dot" aria-hidden="true"></span>
            </label>
            <label class="pay-option">
              <input type="radio" name="payment_method" value="cash" required>
              <span class="pay-ic">${icon('wallet')}</span>
              <span class="pay-copy"><b>${t('payment.cash')}</b><small>${t('payment.cashHint')}</small></span>
              <span class="pay-dot" aria-hidden="true"></span>
            </label>
          </div>
        </div>
        <div class="field"><label for="b-name">${t('booking.parentName')}</label><input class="input" id="b-name" name="name" value="${esc(state.user.name)}" required></div>
        <div class="field"><label for="b-phone">${t('booking.parentPhone')}</label><input class="input" id="b-phone" name="phone" type="tel" value="${esc(state.user.phone ?? '')}" placeholder="${esc(t('booking.phonePh'))}" required></div>
        <div class="field full"><label for="b-comment">${t('booking.wishes')} <span class="form-hint">${t('booking.optional')}</span></label><textarea class="input" id="b-comment" name="comment" placeholder="${esc(t('booking.wishesPh'))}"></textarea></div>
        <p class="form-error full" id="book-error" hidden></p>
        <div class="full wizard-foot">
          <button type="button" class="btn btn-ghost" data-back>${icon('arrowLeft')} ${t('ui.back')}</button>
          <button type="submit" class="btn btn-primary" id="book-submit">${t('booking.submit')} ${icon('check')}</button>
        </div>
      </form>
    </div>`;
  }

  function donePanel() {
    const current = service();
    const participants = Array.isArray(wiz.done?.participants) ? wiz.done.participants : [];
    const children = participants
      .map((child) => `${esc(child.name)}, ${plural('years', child.age)}`)
      .join(' · ');
    return `
    <div class="panel success-panel">
      <span class="big">${icon('check')}</span>
      <h2>${t('booking.doneTitle')}</h2>
      <p>${t('booking.doneText', {
        children: children || t('booking.defaultChild'),
        service: esc(serviceTitle(current)),
        date: fmtDate(wiz.done.booking_date, { weekday: true }),
        time: esc(wiz.done.slot),
      })}</p>
      <div class="hero-cta" style="justify-content:center">
        <a class="btn btn-primary" href="/account/">${t('booking.accountCta')} ${icon('arrowRight')}</a>
        <a class="btn btn-ghost" href="/">${t('booking.homeCta')}</a>
      </div>
    </div>`;
  }

  function render() {
    host.innerHTML = wiz.done ? donePanel() : `${stepsBar()}${wiz.step === 1 ? stepOne() : wiz.step === 2 ? stepTwo() : stepThree()}`;
    host.querySelectorAll('[data-pick]').forEach((button) => button.addEventListener('click', () => {
      wiz.serviceId = button.dataset.pick;
      wiz.slot = null;
      wiz.step = 2;
      loadSlots();
    }));
    host.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => {
      wiz.date = button.dataset.date;
      wiz.slot = null;
      wiz.error = '';
      loadSlots();
    }));
    host.querySelectorAll('[data-slot]').forEach((button) => button.addEventListener('click', () => {
      wiz.slot = button.dataset.slot;
      render();
    }));
    host.querySelectorAll('[data-next]').forEach((button) => button.addEventListener('click', () => {
      wiz.step += 1;
      wiz.error = '';
      render();
    }));
    host.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => {
      wiz.step = Math.max(1, wiz.step - 1);
      render();
    }));
    host.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => {
      wiz.authMode = button.dataset.authMode;
      render();
    }));
    if (wiz.step === 3 && !state.user) {
      bindAuthForm(host, {
        mode: wiz.authMode,
        onSuccess: (user) => { setUser(user); render(); },
      });
    }
    const form = host.querySelector('#book-form');
    if (form) {
      const rows = form.querySelector('#book-participants');
      const addButton = form.querySelector('#book-add-child');
      const priceHint = host.querySelector('#book-price-hint');
      const syncRows = () => {
        const party = [...rows.querySelectorAll('[data-party-row]')];
        party.forEach((row) => { row.querySelector('[data-party-remove]').hidden = party.length < 2; });
        addButton.disabled = party.length >= MAX_PARTICIPANTS;
        priceHint.hidden = party.length < 2;
      };
      addButton.addEventListener('click', () => {
        if (rows.querySelectorAll('[data-party-row]').length >= MAX_PARTICIPANTS) return;
        rows.insertAdjacentHTML('beforeend', participantRowHtml());
        syncRows();
        rows.lastElementChild?.querySelector('input')?.focus();
        reveal(rows.lastElementChild);
      });
      rows.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-party-remove]');
        if (!remove) return;
        if (rows.querySelectorAll('[data-party-row]').length < 2) return;
        remove.closest('[data-party-row]').remove();
        syncRows();
      });
      syncRows();

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const error = host.querySelector('#book-error');
        const submit = host.querySelector('#book-submit');
        error.hidden = true;
        const data = Object.fromEntries(new FormData(form).entries());
        const participants = [...rows.querySelectorAll('[data-party-row]')].map((row) => ({
          name: row.querySelector('[name="participant_name"]').value.trim(),
          age: Number.parseInt(row.querySelector('[name="participant_age"]').value, 10),
        }));
        const invalid = participants.some((child) => [...child.name].length < 2 || !Number.isInteger(child.age) || child.age < 1 || child.age > 17);
        if (!participants.length || invalid) {
          error.textContent = t('booking.childrenError');
          error.hidden = false;
          return;
        }
        submit.disabled = true;
        submit.innerHTML = t('booking.submitting');
        try {
          const result = await api('/api/bookings', {
            method: 'POST',
            body: {
              service_id: wiz.serviceId, date: wiz.date, slot: wiz.slot,
              participants, payment_method: data.payment_method, name: data.name, phone: data.phone, comment: data.comment || null,
            },
          });
          wiz.done = result;
          toast(t('booking.created'), 'success');
          render();
        } catch (err) {
          if (err.code === 'slot_taken') {
            toast(errorText(err), 'error');
            wiz.step = 2;
            wiz.slot = null;
            loadSlots();
            return;
          }
          error.textContent = errorText(err);
          error.hidden = false;
          submit.disabled = false;
          submit.innerHTML = `${t('booking.submit')} ${icon('check')}`;
        }
      });
    }
    reveal(host);
  }

  if (wiz.step === 2) loadSlots();
  else render();
}
