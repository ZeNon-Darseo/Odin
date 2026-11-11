import { api, errorText } from '../api.js';
import { esc, icon, image, fmtPrice, fmtDuration, fmtDate, reveal, toast, countUp } from '../ui.js';
import { t, tList, plural, localized, serviceTitle, serviceDescription, categoryLabel } from '../i18n.js';

const FALLBACK_GALLERY = [
  { src: 'k-hero', cls: 'wide' },
  { src: 'k-massage', cls: 'tall' },
  { src: 'k-choco', cls: '' },
  { src: 'k-party', cls: '' },
  { src: 'k-cave', cls: 'wide' },
];

const FEATURE_ICONS = ['droplet', 'heart', 'shield', 'calendar'];

const REVIEW_MAX_CHARS = 600;

function galleryShape(index, count) {
  if (count >= 5) return ['wide', 'tall', '', '', 'wide', 'tall', '', ''][index % 8];
  if (count >= 2 && index === 0) return 'wide';
  return '';
}

function galleryItems(state) {
  const stored = Array.isArray(state.gallery) ? state.gallery : [];
  if (!stored.length) {
    const captions = tList('home.galleryCaptions');
    return FALLBACK_GALLERY.map((item, index) => ({
      ...item,
      title: captions[index] ?? '',
      desc: '',
    }));
  }
  return stored.map((item, index) => ({
    src: item.image,
    cls: galleryShape(index, stored.length),
    title: localized(item, 'title'),
    desc: localized(item, 'description'),
  }));
}

function reviewCard(comment, services) {
  const rating = Math.max(1, Math.min(5, Number(comment.rating) || 0));
  const meta = [fmtDate(String(comment.created_at).slice(0, 10))];
  const service = (services ?? []).find((item) => item.id === comment.service_id);
  const title = service ? serviceTitle(service) : comment.service_title;
  if (title) meta.push(title);
  return `
  <article class="review" data-reveal>
    <span class="stars" aria-label="${esc(t('home.reviewAria', { n: rating }))}">${icon('star').repeat(rating)}</span>
    <p>«${esc(comment.body)}»</p>
    <div class="who">
      <span class="avatar">${esc(String(comment.author_name || t('home.guest'))[0])}</span>
      <div><b>${esc(comment.author_name)}</b><small>${esc(meta.join(' · '))}</small></div>
    </div>
    ${comment.reply_body ? `<div class="review-reply">
      <span class="rr-label">${icon('heart')} ${t('home.studioReply')}</span>
      <p>${esc(comment.reply_body)}</p>
    </div>` : ''}
  </article>`;
}

function reviewsHtml(comments, services) {
  if (!comments.length) {
    return `<div class="panel empty-state" style="grid-column:1/-1">
      <span class="ic">${icon('bubble')}</span>
      <b>${t('home.reviewsEmptyTitle')}</b>
      <p>${t('home.reviewsEmptyText')}</p>
    </div>`;
  }
  return comments.map((comment) => reviewCard(comment, services)).join('');
}

function reviewsLead(count) {
  return count ? `${t('home.reviewsReal')} · ${plural('reviews', count)}` : t('home.reviewsEmptyLead');
}

function reviewFormHtml(state) {
  if (!state.user) {
    const next = encodeURIComponent('/#reviews');
    return `
    <div class="panel review-invite">
      <span class="ic">${icon('heart')}</span>
      <h3>${t('home.inviteTitle')}</h3>
      <p>${t('home.inviteText')}</p>
      <div class="review-invite-actions">
        <a class="btn btn-primary" href="/login/?next=${next}">${t('home.inviteLogin')} ${icon('arrowRight')}</a>
        <a class="btn btn-ghost" href="/register/?next=${next}">${t('home.inviteRegister')}</a>
      </div>
    </div>`;
  }
  return `
  <form class="panel review-form" id="review-form" novalidate>
    <h3>${t('home.formTitle')}</h3>
    <p class="form-hint">${t('home.formAs', { name: esc(state.user.name) })}</p>
    <div class="field">
      <label>${t('home.formRating')}</label>
      <div class="rating" role="radiogroup" aria-label="${esc(t('home.formAria'))}">
        ${[5, 4, 3, 2, 1].map((value) => `<input type="radio" id="rating-${value}" name="rating" value="${value}" ${value === 5 ? 'checked' : ''}><label for="rating-${value}" title="${esc(t('home.reviewAria', { n: value }))}" aria-label="${esc(t('home.reviewAria', { n: value }))}">${icon('star')}</label>`).join('')}
      </div>
    </div>
    <div class="field"><label for="review-service">${t('home.formProgram')}</label>
      <select class="input" id="review-service" name="service_id">
        <option value="">${t('home.formStudio')}</option>
        ${state.services.map((service) => `<option value="${service.id}">${esc(serviceTitle(service))}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label for="review-body">${t('home.formBody')}</label><textarea class="input" id="review-body" name="body" rows="4" maxlength="${REVIEW_MAX_CHARS}" placeholder="${esc(t('home.formPlaceholder'))}" required></textarea></div>
    <p class="form-error" id="review-error" hidden></p>
    <button class="btn btn-primary btn-block" type="submit" id="review-submit">${t('home.formSubmit')} ${icon('arrowRight')}</button>
  </form>`;
}

function serviceCard(service) {
  const title = serviceTitle(service);
  return `
  <article class="service-card" data-reveal>
    <div class="media">
      <img src="${image(service.image)}" alt="${esc(title)}" loading="lazy">
      <span class="tag">${esc(categoryLabel(service.category))}</span>
      ${service.popular ? `<span class="fav" title="${esc(t('home.popularTitle'))}">${icon('star')}</span>` : ''}
    </div>
    <div class="body">
      <h3>${esc(title)}</h3>
      <p class="desc">${esc(serviceDescription(service))}</p>
      <div class="meta">${icon('clock')} ${fmtDuration(service.duration_min)}</div>
      <div class="foot">
        <span class="price">${fmtPrice(service.price)}</span>
        <a class="btn btn-soft btn-sm" href="/booking/?service=${service.id}">${t('home.choose')} ${icon('arrowRight')}</a>
      </div>
    </div>
  </article>`;
}

const ORDER_MAX_PARTICIPANTS = 6;

function participantRowHtml() {
  return `
  <div class="party-row" data-party-row>
    <input class="input" name="participant_name" placeholder="${esc(t('home.orderParticipantName'))}" aria-label="${esc(t('home.orderParticipantName'))}" maxlength="60" required>
    <input class="input party-age" name="participant_age" type="number" min="1" max="17" step="1" inputmode="numeric" placeholder="${esc(t('home.orderParticipantAge'))}" aria-label="${esc(t('home.orderParticipantAge'))}" required>
    <button type="button" class="icon-btn" data-party-remove aria-label="${esc(t('home.orderRemoveChild'))}" title="${esc(t('home.orderRemoveChild'))}">${icon('close')}</button>
  </div>`;
}

function orderFormHtml(state) {
  return `
  <form id="order-form" class="form-grid order-form" novalidate>
    <div class="field"><label for="o-name">${t('home.orderName')}</label><input class="input" id="o-name" name="name" autocomplete="name" value="${esc(state.user?.name ?? '')}" placeholder="${esc(t('home.orderNamePh'))}" required></div>
    <div class="field"><label for="o-phone">${t('home.orderPhone')}</label><input class="input" id="o-phone" name="phone" type="tel" autocomplete="tel" value="${esc(state.user?.phone ?? '')}" placeholder="${esc(t('home.orderPhonePh'))}" required></div>
    <div class="field full party-field">
      <div class="party-head">
        <span class="party-label">${t('home.orderParty')} <span class="form-hint">${t('home.orderPartyHint')}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" id="order-add-child">${icon('plus')} ${t('home.orderAddChild')}</button>
      </div>
      <div class="party-rows" id="order-participants">${participantRowHtml()}</div>
    </div>
    <div class="field full"><label for="o-service">${t('home.orderProgram')}</label>
      <select class="input" id="o-service" name="service_id">
        <option value="">${t('home.orderNoProgram')}</option>
        ${state.services.map((service) => `<option value="${service.id}">${esc(serviceTitle(service))} · ${fmtPrice(service.price)}</option>`).join('')}
      </select>
    </div>
    <div class="field full"><label for="o-comment">${t('home.orderComment')} <span class="form-hint">${t('home.orderOptional')}</span></label><textarea class="input" id="o-comment" name="comment" rows="3" maxlength="600" placeholder="${esc(t('home.orderCommentPh'))}"></textarea></div>
    <p class="form-error full" id="order-error" hidden></p>
    <div class="full order-submit">
      <button class="btn btn-primary btn-block" type="submit" id="order-submit">${t('home.orderSubmit')} ${icon('send')}</button>
      <span class="order-note">${icon('clock')} ${t('home.orderNote')}</span>
      ${state.user ? `<span class="order-note">${icon('user')} ${t('home.orderAccountNote')}</span>` : ''}
    </div>
  </form>`;
}

export function homeView(state) {
  const popular = state.services.filter((service) => service.popular).slice(0, 4);
  const comments = (state.comments ?? []).slice(0, 12);
  const ticker = tList('home.marquee').map((word) => `${esc(word)} ${icon('sparkles')}`).join('');
  const features = tList('home.features');
  const gallery = galleryItems(state);
  return `
  <section class="hero">
    <div class="hero-media"><img src="${image('k-hero')}" alt="AURA kids"></div>
    <div class="wrap hero-in">
      <span class="kicker">${icon('bubble')} ${t('home.kicker')}</span>
      <h1>${t('home.h1a')}<br><span class="grad">${t('home.h1b')}</span></h1>
      <p class="hero-sub">${t('home.sub')}</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="/booking/">${t('home.ctaBook')} ${icon('arrowRight')}</a>
        <a class="btn btn-ghost" href="/services/">${t('home.ctaPrograms')}</a>
      </div>
      <div class="hero-stats">
        <div><b data-count="${state.services.length || 9}">${state.services.length || 9}</b><span>${t('home.stat1')}</span></div>
        <div><b>2–12</b><span>${t('home.stat2')}</span></div>
        <div><b data-count="4.9" data-decimals="1">4.9</b><span>${t('home.stat3')}</span></div>
      </div>
    </div>
    <aside class="hero-card">
      <div class="row"><span class="stars">${icon('star').repeat(5)}</span> ${t('home.heroRating')}</div>
      <small>${t('home.heroGuests')}</small>
      <div class="row">${icon('clock')} ${t('home.heroHours')}</div>
      <div class="row">${icon('pin')} ${t('home.heroAddress')}</div>
    </aside>
    <div class="scroll-hint">${icon('chevronDown')} ${t('home.scroll')}</div>
  </section>

  <div class="marquee" aria-hidden="true"><div class="marquee-track"><span>${ticker}</span><span>${ticker}</span></div></div>

  <section class="section" id="programs">
    <div class="wrap">
      <div class="section-head" data-reveal>
        <div>
          <span class="eyebrow">${icon('sparkles')} ${t('home.programsEyebrow')}</span>
          <h2>${t('home.programsTitle')}</h2>
        </div>
        <a class="btn btn-ghost" href="/services/">${t('home.allPrograms')} ${icon('arrowRight')}</a>
      </div>
      <div class="cards-grid">${popular.map(serviceCard).join('')}</div>
    </div>
  </section>

  <section class="section" id="gallery">
    <div class="wrap">
      <div class="section-head" data-reveal>
        <div>
          <span class="eyebrow">${icon('eye')} ${t('home.galleryEyebrow')}</span>
          <h2>${t('home.galleryTitle')}</h2>
          <p class="lead">${t('home.galleryLead')}</p>
        </div>
      </div>
      <div class="gallery-grid">
        ${gallery.map((item, index) => `
          <button class="gallery-item ${item.cls}" data-gallery="${index}" data-reveal="scale" aria-label="${esc(t('home.openPhoto', { cap: item.title }))}">
            <img src="${image(item.src)}" alt="${esc(item.title)}" loading="lazy">
            <span class="gallery-shade" aria-hidden="true"></span>
            <span class="gallery-copy"><b>${esc(item.title)}</b>${item.desc ? `<small>${esc(item.desc)}</small>` : ''}</span>
            <span class="gallery-zoom" aria-hidden="true">${icon('expand')}</span>
          </button>`).join('')}
      </div>
    </div>
  </section>

  <section class="section order-section" id="order">
    <div class="wrap order-layout">
      <div class="order-copy" data-reveal>
        <span class="eyebrow">${icon('send')} ${t('home.orderEyebrow')}</span>
        <h2>${t('home.orderTitle')}</h2>
        <p class="lead">${t('home.orderLead')}</p>
        <div class="order-perks">
          <span>${icon('clock')} ${t('home.orderNote')}</span>
          <a href="tel:+77271234567">${icon('phone')} +7 727 123-45-67</a>
          <span>${icon('pin')} ${t('home.heroAddress')}</span>
        </div>
      </div>
      <div class="order-card" data-reveal="scale" id="order-host">${orderFormHtml(state)}</div>
    </div>
  </section>

  <section class="section" id="why">
    <div class="wrap">
      <div class="section-head" data-reveal>
        <div>
          <span class="eyebrow">${icon('heart')} ${t('home.whyEyebrow')}</span>
          <h2>${t('home.whyTitle')}</h2>
        </div>
      </div>
      <div class="features">
        ${features.map(([title, text], index) => `
          <div class="feature" data-reveal>
            <span class="num">0${index + 1}</span>
            <span class="ic">${icon(FEATURE_ICONS[index] ?? 'sparkles')}</span>
            <h3>${esc(title)}</h3>
            <p>${esc(text)}</p>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section" id="reviews">
    <div class="wrap">
      <div class="section-head" data-reveal>
        <div>
          <span class="eyebrow">${icon('star')} ${t('home.reviewsEyebrow')}</span>
          <h2>${t('home.reviewsTitle')}</h2>
          <p class="lead" id="reviews-count">${reviewsLead((state.comments ?? []).length)}</p>
        </div>
      </div>
      <div class="reviews-layout">
        <div class="reviews" id="reviews-list">${reviewsHtml(comments, state.services)}</div>
        <aside class="reviews-aside" id="review-form-host">${reviewFormHtml(state)}</aside>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="cta-band" data-reveal="scale">
        <div>
          <h2>${t('home.ctaTitle')}</h2>
          <p>${t('home.ctaText')}</p>
        </div>
        <a class="btn btn-primary" href="/booking/">${t('home.ctaBook')} ${icon('arrowRight')}</a>
      </div>
    </div>
  </section>`;
}

export function mountHome(root, state) {
  reveal(root);
  countUp(root);
  let activeBox = null;
  let onKey = null;
  let onScroll = null;
  const close = () => {
    activeBox?.remove();
    activeBox = null;
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    document.body.classList.remove('no-scroll');
  };
  const gallery = galleryItems(state);
  root.querySelectorAll('[data-gallery]').forEach((button) => {
    button.addEventListener('click', () => {
      close();
      const item = gallery[Number(button.dataset.gallery)];
      const box = document.createElement('div');
      box.className = 'lightbox';
      box.innerHTML = `
        <button class="icon-btn" aria-label="${esc(t('ui.close'))}">${icon('close')}</button>
        <div class="lightbox-inner"><img src="${image(item.src)}" alt="${esc(item.title)}">
          <div class="lightbox-copy"><b>${esc(item.title)}</b>${item.desc ? `<p>${esc(item.desc)}</p>` : ''}</div>
        </div>`;
      box.addEventListener('click', (event) => { if (event.target === box || event.target.closest('.icon-btn')) close(); });
      onKey = (event) => { if (event.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      document.body.append(box);
      document.body.classList.add('no-scroll');
      activeBox = box;
    });
  });

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const media = root.querySelector('.hero-media img');
    if (media) {
      onScroll = () => {
        if (window.scrollY < window.innerHeight * 1.4) {
          media.style.transform = `translate3d(0, ${Math.round(window.scrollY * 0.08)}px, 0) scale(1.04)`;
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  const orderHost = root.querySelector('#order-host');
  bindOrder(orderHost);

  function bindOrder(host) {
    const form = host?.querySelector('#order-form');
    if (!form) return;
    const rows = form.querySelector('#order-participants');
    const addButton = form.querySelector('#order-add-child');
    const syncRows = () => {
      const party = [...rows.querySelectorAll('[data-party-row]')];
      party.forEach((row) => { row.querySelector('[data-party-remove]').hidden = party.length < 2; });
      addButton.disabled = party.length >= ORDER_MAX_PARTICIPANTS;
    };
    addButton?.addEventListener('click', () => {
      if (rows.querySelectorAll('[data-party-row]').length >= ORDER_MAX_PARTICIPANTS) return;
      rows.insertAdjacentHTML('beforeend', participantRowHtml());
      syncRows();
      rows.lastElementChild?.querySelector('input')?.focus();
      reveal(rows.lastElementChild);
    });
    rows?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-party-remove]');
      if (!remove) return;
      if (rows.querySelectorAll('[data-party-row]').length < 2) return;
      remove.closest('[data-party-row]').remove();
      syncRows();
    });
    syncRows();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = form.querySelector('#order-error');
      const submit = form.querySelector('#order-submit');
      const data = Object.fromEntries(new FormData(form).entries());
      const name = String(data.name ?? '').trim();
      const phone = String(data.phone ?? '').trim();
      const digits = phone.replace(/\D/g, '');
      const participants = [...rows.querySelectorAll('[data-party-row]')].map((row) => ({
        name: row.querySelector('[name="participant_name"]').value.trim(),
        age: Number.parseInt(row.querySelector('[name="participant_age"]').value, 10),
      }));
      error.hidden = true;
      if ([...name].length < 2 || digits.length < 10 || digits.length > 15) {
        error.textContent = t('home.orderRequired');
        error.hidden = false;
        return;
      }
      const invalid = participants.some((child) => [...child.name].length < 2 || !Number.isInteger(child.age) || child.age < 1 || child.age > 17);
      if (!participants.length || invalid) {
        error.textContent = t('home.orderParticipantsError');
        error.hidden = false;
        return;
      }
      submit.disabled = true;
      submit.innerHTML = t('home.orderSubmitting');
      try {
        await api('/api/orders', {
          method: 'POST',
          body: {
            name,
            phone,
            participants,
            service_id: data.service_id || null,
            comment: String(data.comment ?? '').trim() || null,
          },
        });
        host.innerHTML = `
          <div class="order-success">
            <span class="success-orb">${icon('checkCircle')}</span>
            <h3>${t('home.orderSuccessTitle')}</h3>
            <p>${t('home.orderSuccessText', { phone: esc(phone), n: participants.length })}</p>
            <p class="order-success-hint">${t('home.orderSuccessConfirm')}</p>
            <button class="btn btn-ghost" type="button" data-order-again>${t('home.orderAgain')} ${icon('arrowRight')}</button>
          </div>`;
        requestAnimationFrame(() => host.querySelector('.order-success')?.classList.add('in'));
        host.querySelector('[data-order-again]').addEventListener('click', () => {
          host.innerHTML = orderFormHtml(state);
          bindOrder(host);
          reveal(host);
        });
        toast(t('home.orderSuccessTitle'), 'success');
      } catch (err) {
        error.textContent = errorText(err);
        error.hidden = false;
        submit.disabled = false;
        submit.innerHTML = `${t('home.orderSubmit')} ${icon('send')}`;
      }
    });
  }

  const reviewForm = root.querySelector('#review-form');
  reviewForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const list = root.querySelector('#reviews-list');
    const error = reviewForm.querySelector('#review-error');
    const submit = reviewForm.querySelector('#review-submit');
    const body = reviewForm.querySelector('#review-body').value.trim();
    const rating = Number(reviewForm.querySelector('input[name="rating"]:checked')?.value);
    error.hidden = true;
    if ([...body].length < 5) {
      error.textContent = t('home.formTooShort');
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    const original = submit.innerHTML;
    submit.textContent = t('home.formPublishing');
    try {
      const created = await api('/api/comments', {
        method: 'POST',
        body: { rating, body, service_id: reviewForm.querySelector('#review-service').value || null },
      });
      state.comments = [created, ...(state.comments ?? [])];
      list.innerHTML = reviewsHtml(state.comments.slice(0, 12), state.services);
      reveal(list);
      const count = root.querySelector('#reviews-count');
      if (count) count.textContent = reviewsLead(state.comments.length);
      reviewForm.reset();
      toast(t('home.formThanks'), 'success');
    } catch (err) {
      error.textContent = errorText(err);
      error.hidden = false;
    }
    submit.disabled = false;
    submit.innerHTML = original;
  });

  return () => {
    close();
    if (onScroll) window.removeEventListener('scroll', onScroll);
  };
}
