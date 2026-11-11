// Local fixture seed: kids catalog, one admin and demo parents with a believable
// booking history. Used by the dev server and route checks only; production seeding
// happens through owner administration after the reviewed migration.
import { hashPassword } from '../functions/passwords.mjs';

export const SERVICE_IDS = {
  milk: '10000000-0000-4000-8000-000000000001',
  choco: '10000000-0000-4000-8000-000000000002',
  massage: '10000000-0000-4000-8000-000000000003',
  manicure: '10000000-0000-4000-8000-000000000004',
  facepaint: '10000000-0000-4000-8000-000000000005',
  duo: '10000000-0000-4000-8000-000000000006',
  party: '10000000-0000-4000-8000-000000000007',
  tale: '10000000-0000-4000-8000-000000000008',
  cave: '10000000-0000-4000-8000-000000000009',
};

export const CATALOG = [
  {
    id: SERVICE_IDS.milk, title: 'Молочная ванна с облаками', category: 'Ванны и сказки',
    title_kk: 'Бұлтты сүт ваннасы', title_en: 'Milky bath with clouds',
    description: 'Тёплая ванна с молочной пеной и облаком-губкой: ребёнок плещется, а кожа остаётся мягкой. В конце — укутывание в пушистое полотенце и какао.',
    description_kk: 'Жұмсақ сүт көбігі мен бұлт-губкамен жылы ванна: бала шомылып ойнайды, терісі жұмсақ болып қалады. Соңында — жұмсақ сүлгіге оранып, какао ішу.',
    description_en: 'A warm bath with milky foam and a cloud sponge: your child splashes and plays while the skin stays soft. It ends with a cosy towel wrap and a cup of cocoa.',
    duration_min: 30, price: 2900, image: 'k-bubbles', popular: true, active: true, sort_order: 1,
  },
  {
    id: SERVICE_IDS.choco, title: 'Шоколадное облако', category: 'Ванны и сказки',
    title_kk: 'Шоколадты бұлт', title_en: 'Chocolate cloud',
    description: 'Мягкое шоколадное обёртывание для детей от пяти лет: тёплый аромат какао и нежная губка-облако. Кожа гладкая, настроение — праздничное.',
    description_kk: 'Бес жастан асқан балаларға арналған жұмсақ шоколад орау: какаоның жылы хош иісі мен нәзік бұлт-губка. Терісі тегіс, көңіл-күйі мерекелік.',
    description_en: 'A gentle chocolate wrap for children from five: the warm scent of cocoa and a soft cloud sponge. Smooth skin and a festive mood.',
    duration_min: 45, price: 3400, image: 'k-choco', popular: true, active: true, sort_order: 2,
  },
  {
    id: SERVICE_IDS.massage, title: 'Нежный массаж для малышей', category: 'Массажи и забота',
    title_kk: 'Сәбилерге нәзік массаж', title_en: 'Gentle massage for little ones',
    description: 'Расслабляющий массаж спинки и плеч с гипоаллергенным маслом. Помогает снять напряжение после садика и школы, длится всего полчаса.',
    description_kk: 'Гипоаллергенді маймен арқа мен иықты босаңсытатын массаж. Балабақша мен мектептен кейінгі шаршауды тарқатып, бар болғаны жарты сағатқа созылады.',
    description_en: 'A relaxing back and shoulder massage with hypoallergenic oil. It melts away the tension after kindergarten or school and lasts just half an hour.',
    duration_min: 30, price: 2600, image: 'k-massage', popular: true, active: true, sort_order: 3,
  },
  {
    id: SERVICE_IDS.manicure, title: 'СПА-маникюр для принцесс', category: 'Красота и грим',
    title_kk: 'Ханшайымдарға арналған СПА-маникюр', title_en: 'Spa manicure for princesses',
    description: 'Детский маникюр без агрессивных средств: ванночка для ручек, мягкая полировка и покрытие с блёстками на выбор. Для гостей от четырёх лет.',
    description_kk: 'Агрессивті құралдарсыз балалар маникюрі: қол ваннасы, жұмсақ тегістеу және таңдауыңызға қарай жылтыр жабын. Төрт жастан асқан қонақтарға.',
    description_en: 'A kids manicure without harsh products: a hand soak, gentle buffing and a glitter finish of your choice. For guests from four years old.',
    duration_min: 45, price: 3200, image: 'k-beauty', popular: false, active: true, sort_order: 4,
  },
  {
    id: SERVICE_IDS.facepaint, title: 'Аквагрим и блёстки', category: 'Красота и грим',
    title_kk: 'Аквагрим және жылтырлар', title_en: 'Face paint and glitter',
    description: 'Гипоаллергенный аквагрим: бабочки, тигрята и единороги. Мастер работает с детьми от трёх лет и смывает всё тёплой водой без слёз.',
    description_kk: 'Гипоаллергенді аквагрим: көбелектер, жолбарыстар мен жалғыз мүйізділер. Шебер үш жастан асқан балалармен жұмыс істейді және бәрін жылы сумен жасқа толтырмай жуады.',
    description_en: 'Hypoallergenic face paint: butterflies, tiger cubs and unicorns. Our artist works with children from three and washes everything off with warm water, no tears.',
    duration_min: 40, price: 2200, image: 'k-beauty', popular: true, active: true, sort_order: 5,
  },
  {
    id: SERVICE_IDS.duo, title: 'Спа-дуэт «Мама и я»', category: 'Массажи и забота',
    title_kk: 'Спа-дуэт «Мама және мен»', title_en: 'Spa duo "Mom and me"',
    description: 'Парная программа для родителя и ребёнка: мягкий массаж рук, ароматная ванночка и чай с зефиром. Время, когда никуда не нужно спешить.',
    description_kk: 'Ата-ана мен балаға арналған жұптық бағдарлама: қолды жұмсақ массаж, хош иісті ванна және зефирмен шай. Асықпайтын уақыт.',
    description_en: 'A paired program for a parent and a child: a soft hand massage, an aromatic hand bath and tea with marshmallows. Time with nowhere to rush.',
    duration_min: 60, price: 4900, image: 'k-massage', popular: false, active: true, sort_order: 6,
  },
  {
    id: SERVICE_IDS.party, title: 'День рождения в спа', category: 'Праздники и программы',
    title_kk: 'Спа-орталықта туған күн', title_en: 'Birthday at the spa',
    description: 'Праздник для именинника и до пяти друзей: пузырьки, аквагрим, торт на заказ и игры в лаунже. Организацию и уборку берём на себя.',
    description_kk: 'Туған күн иесі мен бес досына арналған мереке: көпіршіктер, аквагрим, тапсырыспен торт және лаунжтағы ойындар. Ұйымдастыру мен тазалауды өз мойнымызға аламыз.',
    description_en: 'A celebration for the birthday child and up to five friends: bubbles, face paint, a made-to-order cake and games in the lounge. We handle the setup and the cleanup.',
    duration_min: 120, price: 6900, image: 'k-party', popular: true, active: true, sort_order: 7,
  },
  {
    id: SERVICE_IDS.tale, title: 'Аромасказка перед сном', category: 'Ванны и сказки',
    title_kk: 'Ұйқы алдындағы хош иісті ертегі', title_en: 'Bedtime aroma tale',
    description: 'Сказка с мягкими ароматами лаванды и ромашки, тёплые компрессы для ручек и расслабляющий массаж стоп. Помогает малышам уснуть дома.',
    description_kk: 'Лаванда мен түймедақтың жұмсақ хош иісімен ертегі, қолға жылы компресс және табанға босаңсытатын массаж. Кішкентайлардың үйде тез ұйықтауына көмектеседі.',
    description_en: 'A story with the soft scents of lavender and chamomile, warm hand compresses and a relaxing foot massage. It helps little ones fall asleep at home.',
    duration_min: 40, price: 2400, image: 'k-ritual', popular: false, active: true, sort_order: 8,
  },
  {
    id: SERVICE_IDS.cave, title: 'Соляная пещера для крох', category: 'Массажи и забота',
    title_kk: 'Сәбилерге арналған тұз үңгірі', title_en: 'Salt cave for tiny guests',
    description: 'Полчаса в уютной соляной пещере с мягким светом и спокойной музыкой. Мягкая тренировка дыхания для детей от двух лет и тишина для родителей.',
    description_kk: 'Жұмсақ жарық пен тыныш музыкамен жайлы тұз үңгірінде жарты сағат. Екі жастан асқан балаларға арналған тыныс алу жаттығуы және ата-аналарға тыныштық.',
    description_en: 'Half an hour in a cosy salt cave with soft light and calm music. A gentle breathing practice for children from two and quiet time for parents.',
    duration_min: 30, price: 1900, image: 'k-cave', popular: false, active: true, sort_order: 9,
  },
];

const day = (offset) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);

export async function buildSeed() {
  const adminPass = await hashPassword('Aura-Admin-2026');
  const guestPass = await hashPassword('GuestDemo-2026');
  const ownerPass = await hashPassword('Aura-Owner-2026');
  const now = new Date().toISOString();
  const users = [
    { id: '20000000-0000-4000-8000-000000000001', email: 'admin@aura-kids.ru', name: 'Администратор AURA kids', phone: '+7 495 120-38-40', password_salt: adminPass.salt, password_hash: adminPass.hash, password_iterations: adminPass.iterations, role: 'admin', created_at: now },
    { id: '20000000-0000-4000-8000-000000000002', email: 'anna.smirnova@example.com', name: 'Анна Смирнова', phone: '+7 916 204-11-87', password_salt: guestPass.salt, password_hash: guestPass.hash, password_iterations: guestPass.iterations, role: 'client', created_at: now },
    { id: '20000000-0000-4000-8000-000000000003', email: 'marina.k@example.com', name: 'Марина Ковалёва', phone: '+7 903 771-52-06', password_salt: guestPass.salt, password_hash: guestPass.hash, password_iterations: guestPass.iterations, role: 'client', created_at: now },
    { id: '20000000-0000-4000-8000-000000000004', email: 'elena.v@example.com', name: 'Елена Верещагина', phone: '+7 926 415-90-33', password_salt: guestPass.salt, password_hash: guestPass.hash, password_iterations: guestPass.iterations, role: 'client', created_at: now },
    { id: '20000000-0000-4000-8000-000000000005', email: 'owner@aura-kids.kz', name: 'Владелец AURA kids', phone: '+7 701 380-12-90', password_salt: ownerPass.salt, password_hash: ownerPass.hash, password_iterations: ownerPass.iterations, role: 'owner', created_at: now },
  ];
  const mk = (id, userId, serviceId, date, slot, status, participants, price, comment = null, paymentMethod = 'card') => {
    const user = users.find((item) => item.id === userId);
    return {
      id, user_id: userId, service_id: serviceId, booking_date: date, slot, status,
      participants: JSON.stringify(participants), payment_method: paymentMethod,
      client_name: user.name, client_phone: user.phone, comment, price, created_at: now,
    };
  };
  const bookings = [
    mk('30000000-0000-4000-8000-000000000001', users[1].id, SERVICE_IDS.milk, day(-6), '12:00', 'completed', [{ name: 'Аня', age: 6 }], 2900),
    mk('30000000-0000-4000-8000-000000000002', users[2].id, SERVICE_IDS.facepaint, day(-4), '15:00', 'completed', [{ name: 'Миша', age: 8 }], 2200, null, 'cash'),
    mk('30000000-0000-4000-8000-000000000003', users[3].id, SERVICE_IDS.tale, day(-2), '11:00', 'completed', [{ name: 'Софья', age: 4 }], 2400, 'Без резких запахов, пожалуйста'),
    mk('30000000-0000-4000-8000-000000000004', users[1].id, SERVICE_IDS.choco, day(-1), '18:00', 'cancelled', [{ name: 'Аня', age: 6 }], 3400),
    mk('30000000-0000-4000-8000-000000000005', users[2].id, SERVICE_IDS.party, day(1), '16:00', 'confirmed', [{ name: 'Миша', age: 8 }, { name: 'Тимур', age: 7 }, { name: 'Лена', age: 6 }], 6900, 'День рождения: 5 гостей'),
    mk('30000000-0000-4000-8000-000000000006', users[3].id, SERVICE_IDS.massage, day(2), '13:00', 'pending', [{ name: 'Софья', age: 4 }], 2600, null, 'cash'),
    mk('30000000-0000-4000-8000-000000000007', users[1].id, SERVICE_IDS.duo, day(3), '10:00', 'confirmed', [{ name: 'Аня', age: 6 }], 4900, 'Вдвоём с мамой'),
  ];
  const slot_holds = bookings
    .filter((booking) => ['pending', 'confirmed'].includes(booking.status))
    .map((booking) => ({ service_id: booking.service_id, booking_date: booking.booking_date, slot: booking.slot, booking_id: booking.id }));
  const comment = (id, userId, serviceId, rating, body, daysAgo) => ({
    id, user_id: userId, service_id: serviceId,
    author_name: users.find((user) => user.id === userId).name,
    rating, body, status: 'published',
    created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  });
  const comments = [
    comment('40000000-0000-4000-8000-000000000001', users[1].id, SERVICE_IDS.milk, 5, 'Дочка впервые сама попросилась «ещё раз в облачка». Мастер говорила с ней как с принцессой, а я пила чай рядом. Вышли обе довольные, кожа у Ани мягкая-мягкая.', 6),
    comment('40000000-0000-4000-8000-000000000002', users[2].id, SERVICE_IDS.party, 5, 'Устроили Мише праздник на пять человек: пузырьки, аквагрим, торт на заказ. Организаторы взяли всё на себя, а мы просто радовались вместе с детьми.', 4),
    comment('40000000-0000-4000-8000-000000000003', users[3].id, SERVICE_IDS.tale, 5, 'Сказка с маслами перед сном — лучшее, что мы пробовали. Софья уснула по дороге домой и спала до утра. Теперь у нас ритуал каждый месяц.', 2),
    comment('40000000-0000-4000-8000-000000000004', users[1].id, SERVICE_IDS.massage, 5, 'Нежный массаж после садика — Аня впервые сидела спокойно все полчаса. Отдельное спасибо за тишину и мягкий свет в кабинете.', 1),
    comment('40000000-0000-4000-8000-000000000005', users[2].id, null, 5, 'Ходим к вам уже полгода: всегда чисто, спокойно и без спешки. Миша называет студию «домом с пузырьками».', 0),
  ];
  comments[0].reply_body = 'Анечке — воздушные объятия от всей команды. Спасибо, что доверяете нам её первые облачка.';
  comments[0].reply_by = users[4].id;
  comments[0].replied_at = new Date(Date.now() - 5 * 86400000).toISOString();
  const gallery_items = [
    {
      id: '50000000-0000-4000-8000-000000000001', image: 'k-bubbles', active: true, sort_order: 1,
      title: 'Облачная ванна', title_kk: 'Бұлтты ванна', title_en: 'Cloud bath',
      description: 'Молочная пена, тёплый свет и облако-губка — первый шаг в спа без слёз.',
      description_kk: 'Сүт көбігі, жылы жарық және бұлт-губка — жасқа толмайтын спаға алғашқы қадам.',
      description_en: 'Milky foam, warm light and a cloud sponge — the first step into the spa, tears-free.',
      created_at: new Date(Date.now() - 36 * 86400000).toISOString(),
    },
    {
      id: '50000000-0000-4000-8000-000000000002', image: 'k-massage', active: true, sort_order: 2,
      title: 'Комната мягкого массажа', title_kk: 'Нәзік массаж бөлмесі', title_en: 'Gentle massage room',
      description: 'Приглушённый свет, гипоаллергенное масло и полчаса тишины для маленького гостя.',
      description_kk: 'Бәсең жарық, гипоаллергенді май және кішкентай қонақ үшін жарты сағат тыныштық.',
      description_en: 'Dimmed light, hypoallergenic oil and half an hour of calm for a little guest.',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: '50000000-0000-4000-8000-000000000003', image: 'k-choco', active: true, sort_order: 3,
      title: 'Шоколадные облака', title_kk: 'Шоколадты бұлттар', title_en: 'Chocolate clouds',
      description: 'Тёплый аромат какао, нежное обёртывание и губка-облако — любимый ритуал после пяти лет.',
      description_kk: 'Какаоның жылы хош иісі, нәзік орау және бұлт-губка — бес жастан кейінгі сүйікті рәсім.',
      description_en: 'Warm cocoa scent, a gentle wrap and a cloud sponge — the favourite ritual from age five.',
      created_at: new Date(Date.now() - 24 * 86400000).toISOString(),
    },
    {
      id: '50000000-0000-4000-8000-000000000004', image: 'k-party', active: true, sort_order: 4,
      title: 'Праздник с пузырьками', title_kk: 'Көпіршіктермен мереке', title_en: 'A bubble party',
      description: 'Гирлянды, аквагрим и торт на заказ: студия берёт организацию и уборку на себя.',
      description_kk: 'Шамдар, аквагрим және тапсырыспен торт: студия ұйымдастыру мен тазалауды өз мойнына алады.',
      description_en: 'Garlands, face paint and a made-to-order cake: the studio handles setup and cleanup.',
      created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
    },
    {
      id: '50000000-0000-4000-8000-000000000005', image: 'k-cave', active: true, sort_order: 5,
      title: 'Соляная пещера', title_kk: 'Тұз үңгірі', title_en: 'The salt cave',
      description: 'Мягкий свет, спокойная музыка и дыхательная практика для самых маленьких.',
      description_kk: 'Жұмсақ жарық, тыныш музыка және ең кішкентайларға арналған тыныс алу жаттығуы.',
      description_en: 'Soft light, calm music and a breathing practice for the tiniest guests.',
      created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    },
  ];
  const order = (id, name, phone, participants, serviceId, comment, status, daysAgo, userId = null) => ({
    id, user_id: userId, name, phone, participants: JSON.stringify(participants), service_id: serviceId,
    comment, status, confirmed_at: null, created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  });
  const orders = [
    order('60000000-0000-4000-8000-000000000001', 'Динара Ахметова', '+7 701 555-18-20', [{ name: 'Алиса', age: 5 }, { name: 'Марк', age: 3 }], SERVICE_IDS.party, 'Хотим день рождения на 6 детей в субботу, нужен торт с единорогом.', 'new', 0.2),
    order('60000000-0000-4000-8000-000000000002', 'Анна Смирнова', '+7 916 204-11-87', [{ name: 'Тимур', age: 7 }, { name: 'Милана', age: 4 }], SERVICE_IDS.massage, 'После школы болит спина, подскажите свободное время на неделе.', 'contacted', 1.4, '20000000-0000-4000-8000-000000000002'),
    order('60000000-0000-4000-8000-000000000003', 'Айгуль Серик', '+7 702 331-44-55', [{ name: 'Медина', age: 3 }], null, 'Хотим первый раз в спа, посоветуйте самую мягкую программу.', 'new', 2.1),
  ];
  return {
    users,
    sessions: [],
    auth_limiter: [],
    services: CATALOG.map((service) => ({ ...service, created_at: now })),
    bookings,
    slot_holds,
    comments,
    gallery_items,
    orders,
  };
}