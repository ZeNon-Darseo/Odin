import { esc, icon, image, fmtPrice, fmtDuration, reveal, debounce } from '../ui.js';
import { t, serviceTitle, serviceDescription, categoryLabel } from '../i18n.js';

const CATEGORIES = ['Все', 'Ванны и сказки', 'Массажи и забота', 'Красота и грим', 'Праздники и программы'];
const CATEGORY_KEYS = { 'Все': 'services.all', 'Ванны и сказки': 'cat.baths', 'Массажи и забота': 'cat.massage', 'Красота и грим': 'cat.beauty', 'Праздники и программы': 'cat.party' };
const categoryText = (category) => (CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : categoryLabel(category));

function card(service) {
  const title = serviceTitle(service);
  return `
      <article class="service-card in">
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

export function servicesView(state) {
  return `
  <header class="page-head">
    <div class="wrap">
      <nav class="crumbs"><a href="/">${t('nav.home')}</a>${icon('chevronDown')}<span>${t('nav.services')}</span></nav>
      <h1>${t('services.title')}</h1>
      <p>${t('services.lead')}</p>
    </div>
  </header>
  <section class="wrap" style="padding-bottom: calc(24px * var(--site-space, 1) * 3)">
    <div class="toolbar">
      <div class="filter-chips" id="cat-chips">
        ${CATEGORIES.map((category, index) => `<button class="filter-chip ${index === 0 ? 'active' : ''}" data-cat="${esc(category)}">${esc(categoryText(category))}</button>`).join('')}
      </div>
      <div class="search">${icon('search')}<input class="input" id="svc-search" type="search" placeholder="${esc(t('services.search'))}" aria-label="${esc(t('services.searchAria'))}"></div>
      <select class="input" id="svc-sort" aria-label="${esc(t('services.sortPopular'))}">
        <option value="popular">${t('services.sortPopular')}</option>
        <option value="price-asc">${t('services.sortPriceAsc')}</option>
        <option value="price-desc">${t('services.sortPriceDesc')}</option>
        <option value="duration">${t('services.sortDuration')}</option>
      </select>
    </div>
    <p class="form-hint" id="svc-count" style="margin-bottom: 16px"></p>
    <div class="cards-grid" id="svc-grid"></div>
    <div id="svc-empty"></div>
  </section>`;
}

export function mountServices(root, state) {
  const grid = root.querySelector('#svc-grid');
  const empty = root.querySelector('#svc-empty');
  const count = root.querySelector('#svc-count');
  let category = 'Все';
  let query = '';
  let sort = 'popular';

  const render = () => {
    let list = state.services.filter((service) => category === 'Все' || service.category === category);
    if (query) {
      const needle = query.toLowerCase();
      list = list.filter((service) => `${serviceTitle(service)} ${serviceDescription(service)} ${service.title} ${service.description}`.toLowerCase().includes(needle));
    }
    const sorters = {
      popular: (a, b) => Number(b.popular) - Number(a.popular),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      duration: (a, b) => a.duration_min - b.duration_min,
    };
    list = [...list].sort(sorters[sort]);
    count.textContent = list.length ? t('services.count', { n: list.length }) : '';
    grid.innerHTML = list.map(card).join('');
    empty.innerHTML = list.length ? '' : `
      <div class="empty-state">
        <span class="ic">${icon('search')}</span>
        <b>${t('services.emptyTitle')}</b>
        <p>${t('services.emptyText')}</p>
        <button class="btn btn-ghost btn-sm" id="svc-reset">${t('services.reset')}</button>
      </div>`;
    empty.querySelector('#svc-reset')?.addEventListener('click', () => {
      category = 'Все'; query = ''; sort = 'popular';
      root.querySelector('#svc-search').value = '';
      root.querySelector('#svc-sort').value = 'popular';
      root.querySelectorAll('[data-cat]').forEach((chip) => chip.classList.toggle('active', chip.dataset.cat === 'Все'));
      render();
    });
  };

  root.querySelectorAll('[data-cat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      category = chip.dataset.cat;
      root.querySelectorAll('[data-cat]').forEach((node) => node.classList.toggle('active', node === chip));
      render();
    });
  });
  root.querySelector('#svc-search').addEventListener('input', debounce((event) => { query = event.target.value.trim(); render(); }, 200));
  root.querySelector('#svc-sort').addEventListener('change', (event) => { sort = event.target.value; render(); });
  render();
  reveal(root);
}
