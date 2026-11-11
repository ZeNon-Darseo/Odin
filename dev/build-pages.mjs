// Generates the multi-page HTML entry points in web/. Each page is a real
// document with its own title/description; app.js mounts the matching view.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');

const PAGES = [
  {
    dir: '',
    title: 'AURA kids — детское спа в Алматы · программы для детей 2–12 лет',
    description: 'AURA kids — детское спа в розово-фиолетовых тонах: пенные ванны, нежный массаж, аквагрим, спа-дни рождения и соляная пещера для детей 2–12 лет. Онлайн-запись, кабинет родителя и цены в тенге.',
    ogTitle: 'AURA kids — маленьким гостям большое спа.',
    ogDescription: 'Пенные ванны, нежные массажи и спа-дни рождения для детей 2–12 лет. Онлайн-запись на 30 дней вперёд.',
  },
  {
    dir: 'services',
    title: 'Программы детского спа в Алматы — AURA kids',
    description: 'Девять программ AURA kids: молочные ванны, шоколадное спа, массаж, аквагрим, спа-дни рождения и соляная пещера. Цены в тенге, запись онлайн.',
    ogTitle: 'Программы AURA kids.',
    ogDescription: 'Ванны, массаж, красота и праздники для детей 2–12 лет. Выберите программу и запишитесь онлайн.',
  },
  {
    dir: 'booking',
    title: 'Онлайн-запись в детское спа — AURA kids',
    description: 'Запишите ребёнка в AURA kids: выберите программу, дату и удобное время. Подтверждение брони придёт в кабинет родителя.',
    ogTitle: 'Запись в AURA kids.',
    ogDescription: 'Выберите программу, дату и время — подтверждение в кабинете родителя.',
  },
  {
    dir: 'login',
    title: 'Вход в кабинет родителя — AURA kids',
    description: 'Войдите в кабинет родителя AURA kids, чтобы управлять записями, отзывами и данными ребёнка.',
    ogTitle: 'Вход в AURA kids.',
    ogDescription: 'Управляйте записями и отзывами в кабинете родителя.',
    noindex: true,
  },
  {
    dir: 'register',
    title: 'Регистрация — AURA kids',
    description: 'Создайте аккаунт AURA kids, чтобы бронировать программы детского спа, следить за визитами и оставлять отзывы.',
    ogTitle: 'Регистрация в AURA kids.',
    ogDescription: 'Создайте аккаунт, чтобы бронировать программы и оставлять отзывы.',
    noindex: true,
  },
  {
    dir: 'account',
    title: 'Кабинет родителя — AURA kids',
    description: 'Кабинет родителя AURA kids: предстоящие визиты, история программ, отзывы и настройки профиля.',
    ogTitle: 'Кабинет родителя AURA kids.',
    ogDescription: 'Предстоящие визиты, история и отзывы в одном месте.',
    noindex: true,
  },
  {
    dir: 'admin',
    title: 'Панель команды — AURA kids',
    description: 'Панель команды AURA kids: бронирования, отзывы, клиенты и программы студии.',
    ogTitle: 'Панель команды AURA kids.',
    ogDescription: 'Бронирования, отзывы и программы студии.',
    noindex: true,
  },
  {
    file: '404.html',
    title: 'Страница не найдена — AURA kids',
    description: 'Такой страницы в AURA kids нет. Вернитесь на главную или выберите программу детского спа.',
    ogTitle: 'Страница не найдена — AURA kids.',
    ogDescription: 'Вернитесь на главную или выберите программу детского спа.',
    noindex: true,
  },
];

const html = ({ title, description, ogTitle, ogDescription, noindex }) => `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${noindex ? '<meta name="robots" content="noindex">' : ''}
  <meta name="theme-color" content="#fff6fb">
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('aura-theme');
        if (theme !== 'dark' && theme !== 'light') {
          theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        if (theme === 'dark') {
          document.documentElement.dataset.theme = 'dark';
          var meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute('content', '#140e1b');
        }
        var lang = localStorage.getItem('aura-lang');
        if (lang === 'kk' || lang === 'en' || lang === 'ru') document.documentElement.lang = lang;
      } catch (error) { /* storage can be unavailable in private mode */ }
    })();
  </script>
  <meta property="og:type" content="website">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:image" content="/assets/k-hero.jpg">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@500;600;700&family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
  <div class="ambient" aria-hidden="true">
    <span class="blob-c"></span>
    <span class="bubble b1"></span><span class="bubble b2"></span><span class="bubble b3"></span><span class="bubble b4"></span>
  </div>
  <div class="grain" aria-hidden="true"></div>
  <header class="site-header" id="site-header"></header>
  <main id="view">
    <div class="boot-screen" aria-label="Загрузка">
      <span class="brand-mark boot-mark"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM5.5 13a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM16.5 15.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg></span>
      <p>AURA kids</p>
    </div>
  </main>
  <footer class="site-footer" id="site-footer"></footer>
  <noscript><p style="padding:120px 24px;text-align:center">Для онлайн-записи в AURA kids включите JavaScript в браузере или позвоните нам: +7 727 123-45-67.</p></noscript>
  <script type="module" src="/js/app.js"></script>
</body>
</html>
`;

for (const page of PAGES) {
  const target = page.file ? path.join(web, page.file) : path.join(web, page.dir, 'index.html');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html(page), 'utf8');
  console.log(`page: ${page.file ? `/${page.file}` : page.dir ? `/${page.dir}/` : '/'}`);
}
