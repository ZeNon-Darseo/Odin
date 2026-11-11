// Local knowledge responder behind /api/assistant. It answers from the live
// service catalog in the visitor's language and stays credential-free until the
// site's Qoder Cloud Agent capability is enabled on the backend.

export const ASSISTANT_MODE = 'local-demo';
export const ASSISTANT_LANGS = ['ru', 'kk', 'en'];

const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' };

const CATEGORY_LABELS = {
  ru: { baths: 'Ванны и сказки', massage: 'Массажи и забота', beauty: 'Красота и грим', party: 'Праздники и программы' },
  kk: { baths: 'Ванналар мен ертегілер', massage: 'Массаждар мен қамқорлық', beauty: 'Сұлулық және грим', party: 'Мерекелер мен бағдарламалар' },
  en: { baths: 'Baths and stories', massage: 'Massage and care', beauty: 'Beauty and make-up', party: 'Parties and programs' },
};

const CATEGORY_BY_NAME = {
  'Ванны и сказки': 'baths',
  'Массажи и забота': 'massage',
  'Красота и грим': 'beauty',
  'Праздники и программы': 'party',
};

const CATEGORY_WORDS = {
  baths: ['ванн', 'молоч', 'шоколад', 'облак', 'сказк', 'арома', 'лаванд', 'сүт', 'бұлт', 'ертег', 'bath', 'milk', 'choco', 'cloud', 'tale', 'aroma'],
  massage: ['массаж', 'спин', 'плеч', 'расслаб', 'солян', 'пещер', 'дуэт', 'мама и я', 'үңгір', 'тұз', 'massage', 'relax', 'salt', 'cave', 'duo'],
  beauty: ['маникюр', 'аквагрим', 'грим', 'блёстк', 'блестк', 'красот', 'принцесс', 'ханшайым', 'сұлулық', 'manicure', 'face paint', 'glitter', 'beauty', 'princess'],
  party: ['день рождения', 'рождени', 'праздник', 'туған күн', 'мереке', 'birthday', 'party'],
};

const BOOKING_WORDS = ['запис', 'брон', 'book', 'жазыл', 'бронда'];
const BIRTHDAY_WORDS = ['день рождения', 'рождени', 'туған күн', 'birthday'];
const PRICE_WORDS = ['сколько', 'цена', 'цен', 'стоит', 'стоимость', 'прайс', 'қанша', 'баға', 'price', 'cost', 'how much'];
const AGE_WORDS = ['возраст', 'лет', 'года', 'жас', 'age', 'years old'];
const ADDRESS_WORDS = ['адрес', 'где вы', 'как добраться', 'телефон', 'контакт', 'мекенжай', 'қайда', 'address', 'where are', 'phone', 'contact'];
const SCHEDULE_WORDS = ['график', 'работа', 'во сколько', 'часы', 'режим', 'сағат', 'жұмыс', 'hours', 'open', 'schedule'];
const PAYMENT_WORDS = ['оплат', 'оплатить', 'карт', 'наличн', 'төле', 'төлем', 'payment', 'pay', 'card'];
const CANCEL_WORDS = ['отмен', 'перенес', 'бас тарт', 'ауыстыр', 'cancel', 'reschedul'];
const SAFETY_WORDS = ['аллерг', 'безопас', 'гипоаллерг', 'здоров', 'қауіпсіз', 'денсаулық', 'safe', 'allerg', 'health'];
const REVIEW_WORDS = ['отзыв', 'рейтинг', 'пікір', 'review', 'rating'];
const RECOMMEND_WORDS = ['подбер', 'посовет', 'что выбрать', 'порекоменд', 'таңда', 'кеңес', 'recommend', 'suggest', 'which program'];
const GREET_WORDS = ['привет', 'здравств', 'добрый', 'сәлем', 'салам', 'hello', 'hi!', 'hi ', 'good morning'];
const THANKS_WORDS = ['спасибо', 'благодар', 'рахмет', 'thanks', 'thank you'];

const T = {
  ru: {
    empty: 'Каталог программ сейчас обновляется. Позвоните нам: +7 727 123-45-67 — подскажем свободное время.',
    booking: 'Записаться можно на сайте: выберите программу, дату и свободное время, затем подтвердите контакты. Бронь появится в кабинете родителя, а студия подтвердит её в течение часа. Отменить визит тоже можно в кабинете.',
    birthday: (money, duration) => `День рождения в спа — ${money} за ${duration}: именинник и до пяти друзей, пузырьки, аквагрим, торт на заказ и игры в лаунже. Организацию и уборку берём на себя.`,
    service: (title, money, duration, description) => `«${title}» — ${money} · ${duration}.\n${description}`,
    priceRange: (min, max) => `Программы для детей — от ${min} до ${max}. Самые популярные:`,
    priceUnder: (budget, list) => `До ${budget} подойдут:\n${list}`,
    priceNone: (budget, min) => `До ${budget} программ нет: самое доступное начинается от ${min}. Например, соляная пещера или аромасказка.`,
    recommend: 'Если выбираете впервые, начните с этих программ:',
    category: (label, list) => `В разделе «${label}»:\n${list}`,
    age: 'Программы рассчитаны на детей 2–12 лет: для малышей — молочные ванны и аромасказки, для дошкольников — аквагрим и массаж, для школьников — СПА-маникюр и дни рождения. Возраст ребёнка уточняем при бронировании.',
    address: 'Мы в Алматы: пр. Достык, 12, БЦ «Нурлы Тау», 3 этаж. Телефон +7 727 123-45-67, почта hello@aura-kids.kz. Парковка есть у бизнес-центра.',
    schedule: 'Студия работает ежедневно с 10:00 до 20:00. Записаться можно на ближайшие 30 дней; свободные окна видны сразу при выборе даты.',
    payment: 'Оплата — в студии после визита: картой или наличными. Онлайн-оплаты нет, поэтому карту привязывать не нужно.',
    cancel: 'Отменить или перенести визит можно в кабинете родителя не позже дня визита — место сразу освободится. Если что-то пошло не так, позвоните: +7 727 123-45-67.',
    safety: 'Мы используем гипоаллергенные средства и работаем с детьми от 2 лет. Если у ребёнка аллергия или особенности здоровья, добавьте это в пожелания к брони и позвоните нам — мастер всё учтёт. По медицинским вопросам лучше сначала посоветоваться с педиатром.',
    reviews: 'Родители ставят студии 4,9 из 5. Отзывы можно прочитать на главной в разделе «Отзывы», а после визита — оставить свой.',
    greeting: 'Здравствуйте! Я помощник AURA kids. Могу подсказать программы и цены, свободное время, адрес и как записаться.',
    thanks: 'Рада помочь! Если появятся вопросы — я рядом.',
    fallback: 'Могу подсказать программы и цены, свободное время, адрес и как записаться. Сформулируйте вопрос чуть иначе — или позвоните нам: +7 727 123-45-67.',
  },
  kk: {
    empty: 'Бағдарламалар каталогы жаңартылып жатыр. Бізге қоңырау шалыңыз: +7 727 123-45-67 — бос уақытты айтамыз.',
    booking: 'Сайтта жазылу қарапайым: бағдарламаны, күн мен бос уақытты таңдап, байланыс деректерін растаңыз. Бронь ата-ана кабинетінде көрінеді, ал студия оны бір сағат ішінде растайды. Визитті сол жерден болдырмауға да болады.',
    birthday: (money, duration) => `Спа-орталықтағы туған күн — ${duration} үшін ${money}: туған күн иесі және бес досы, көпіршіктер, аквагрим, тапсырыспен торт және лаунжтағы ойындар. Ұйымдастыру мен тазалауды өз мойнымызға аламыз.`,
    service: (title, money, duration, description) => `«${title}» — ${money} · ${duration}.\n${description}`,
    priceRange: (min, max) => `Балалар бағдарламалары — ${min} бастап ${max} дейін. Ең танымалдары:`,
    priceUnder: (budget, list) => `${budget} дейін мыналар келеді:\n${list}`,
    priceNone: (budget, min) => `${budget} дейін бағдарлама жоқ: ең қолжетімдісі ${min} басталады. Мысалы, тұз үңгірі немесе хош иісті ертегі.`,
    recommend: 'Алғаш рет таңдап жатсаңыз, мына бағдарламалардан бастаңыз:',
    category: (label, list) => `«${label}» бөлімінде:\n${list}`,
    age: 'Бағдарламалар 2–12 жас аралығындағы балаларға арналған: сәбилерге — сүт ванналары мен хош иісті ертегілер, мектепке дейінгілерге — аквагрим мен массаж, мектеп оқушыларына — СПА-маникюр мен туған күндер. Баланың жасын брондау кезінде нақтылаймыз.',
    address: 'Біз Алматыдамыз: Достық даңғылы, 12, «Нұрлы Тау» БО, 3 қабат. Телефон +7 727 123-45-67, пошта hello@aura-kids.kz. Бизнес-орталықтың жанында тұрақ бар.',
    schedule: 'Студия күн сайын 10:00-ден 20:00-ге дейін жұмыс істейді. Алдағы 30 күнге жазылуға болады; бос уақыт күнді таңдағанда бірден көрінеді.',
    payment: 'Төлем визиттен кейін студияда жасалады: картамен немесе қолма-қол. Онлайн төлем жоқ, сондықтан картаны байланыстырудың қажеті жоқ.',
    cancel: 'Визитті ата-ана кабинетінде визит күнінен кешіктірмей болдырмауға немесе ауыстыруға болады — орын бірден босады. Мәселе болса, +7 727 123-45-67 нөміріне қоңырау шалыңыз.',
    safety: 'Біз гипоаллергенді құралдарды қолданамыз және 2 жастан асқан балалармен жұмыс істейміз. Балада аллергия немесе денсаулық ерекшеліктері болса, брондағы тілектерге жазып, бізге қоңырау шалыңыз — шебер бәрін ескереді. Медициналық сұрақтар бойынша алдымен педиатрмен кеңесіңіз.',
    reviews: 'Ата-аналар студияны 5-тен 4,9 деп бағалайды. Пікірлерді басты беттегі «Пікірлер» бөлімінен оқуға болады, ал визиттен кейін өз пікіріңізді қалдыра аласыз.',
    greeting: 'Сәлеметсіз бе! Мен AURA kids көмекшісімін. Бағдарламалар мен бағаларды, бос уақытты, мекенжайды және қалай жазылуды айтып беремін.',
    thanks: 'Көмектескеніме қуаныштымын! Сұрақтарыңыз болса, мен осындамын.',
    fallback: 'Бағдарламалар мен бағалар, бос уақыт, мекенжай және жазылу туралы айта аламын. Сұрағыңызды сәл басқаша қоясыз ба — немесе бізге қоңырау шалыңыз: +7 727 123-45-67.',
  },
  en: {
    empty: 'The program catalog is being updated. Call us on +7 727 123-45-67 and we will check the free times.',
    booking: 'Booking online is simple: choose a program, a date and a free time, then confirm your contacts. The booking appears in the parent account and the studio confirms it within an hour. You can cancel there too.',
    birthday: (money, duration) => `A spa birthday is ${money} for ${duration}: the birthday child and up to five friends, bubbles, face paint, a made-to-order cake and games in the lounge. We handle setup and cleanup.`,
    service: (title, money, duration, description) => `${title} — ${money} · ${duration}.\n${description}`,
    priceRange: (min, max) => `Programs for children cost ${min} to ${max}. The most popular are:`,
    priceUnder: (budget, list) => `Up to ${budget}, these fit:\n${list}`,
    priceNone: (budget, min) => `Nothing is available up to ${budget}: the most affordable programs start at ${min}, such as the salt cave or the aroma tale.`,
    recommend: 'If this is your first visit, start with these programs:',
    category: (label, list) => `In ${label}:\n${list}`,
    age: 'Programs are designed for children aged 2–12: milky baths and aroma tales for toddlers, face paint and massage for preschoolers, spa manicure and birthdays for school-age guests. We confirm the child’s age when you book.',
    address: 'We are in Almaty: 12 Dostyk Ave, Nurly Tau Business Center, 3rd floor. Phone +7 727 123-45-67, email hello@aura-kids.kz. Parking is available at the business center.',
    schedule: 'The studio is open daily from 10:00 to 20:00. You can book up to 30 days ahead; free times appear as soon as you pick a date.',
    payment: 'Payment is made at the studio after the visit, by card or in cash. There is no online payment, so you do not need to link a card.',
    cancel: 'You can cancel or reschedule in the parent account before the visit day; the slot is freed immediately. If something goes wrong, call +7 727 123-45-67.',
    safety: 'We use hypoallergenic products and work with children from two years old. If your child has allergies or health considerations, add a note to the booking and call us — the specialist will take it into account. For medical questions, please consult a pediatrician first.',
    reviews: 'Parents rate the studio 4.9 out of 5. You can read reviews in the Reviews section on the home page and leave your own after a visit.',
    greeting: 'Hello! I am the AURA kids assistant. I can help with programs, prices, free times, the address and booking.',
    thanks: 'Happy to help! I am here if anything else comes up.',
    fallback: 'I can help with programs and prices, free times, the address and booking. Try asking a little differently — or call us: +7 727 123-45-67.',
  },
};

export function normalizeLang(value) {
  return ASSISTANT_LANGS.includes(value) ? value : 'ru';
}

const normalize = (value) => String(value ?? '').toLowerCase().replaceAll('ё', 'е');
const hasAny = (text, words) => words.some((word) => text.includes(word));

const money = (value, lang) => `${new Intl.NumberFormat(LOCALES[lang]).format(Number(value) || 0)} ₸`;

function duration(minutes, lang) {
  const min = Math.max(1, Number(minutes) || 0);
  if (min < 60) return `${min} ${lang === 'en' ? 'min' : lang === 'kk' ? 'мин' : 'мин'}`;
  const whole = Math.floor(min / 60);
  const rest = min % 60;
  const hourWord = lang === 'en' ? (whole === 1 ? 'h' : 'h') : lang === 'kk' ? 'сағ' : 'ч';
  return rest ? `${whole} ${hourWord} ${rest} мин` : `${whole} ${hourWord}`;
}

function localized(service, field, lang) {
  if (lang === 'kk' && service[`${field}_kk`]) return service[`${field}_kk`];
  if (lang === 'en' && service[`${field}_en`]) return service[`${field}_en`];
  return service[field] ?? '';
}

const serviceTitle = (service, lang) => localized(service, 'title', lang);
const serviceDescription = (service, lang) => localized(service, 'description', lang);

const line = (service, lang) => `• ${serviceTitle(service, lang)} — ${money(service.price, lang)} · ${duration(service.duration_min, lang)}`;
const listText = (list, lang) => list.map((service) => line(service, lang)).join('\n');

function popular(services, count) {
  return [...services]
    .sort((a, b) => Number(b.popular) - Number(a.popular) || a.sort_order - b.sort_order)
    .slice(0, count);
}

function detectCategory(text) {
  for (const [key, words] of Object.entries(CATEGORY_WORDS)) {
    if (hasAny(text, words)) return key;
  }
  return null;
}

function detectIntent(text) {
  if (hasAny(text, BOOKING_WORDS)) return 'booking';
  if (hasAny(text, BIRTHDAY_WORDS)) return 'birthday';
  if (hasAny(text, PRICE_WORDS)) return 'price';
  if (hasAny(text, CANCEL_WORDS)) return 'cancel';
  if (hasAny(text, ADDRESS_WORDS)) return 'address';
  if (hasAny(text, SCHEDULE_WORDS)) return 'schedule';
  if (hasAny(text, PAYMENT_WORDS)) return 'payment';
  if (hasAny(text, SAFETY_WORDS)) return 'safety';
  if (hasAny(text, REVIEW_WORDS)) return 'reviews';
  if (hasAny(text, AGE_WORDS)) return 'age';
  if (hasAny(text, RECOMMEND_WORDS)) return 'recommend';
  if (hasAny(text, THANKS_WORDS)) return 'thanks';
  if (hasAny(text, GREET_WORDS)) return 'greeting';
  return 'fallback';
}

function findService(message, services, lang) {
  let best = null;
  let bestScore = 0;
  for (const service of services) {
    for (const title of [service.title, service.title_kk, service.title_en]) {
      if (!title) continue;
      const normalizedTitle = normalize(title).replace(/[«»"]/g, '');
      if (normalizedTitle && message.includes(normalizedTitle)) return service;
      const words = normalizedTitle.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 5);
      const score = words.filter((word) => message.includes(word)).length;
      if (score > bestScore) { best = service; bestScore = score; }
    }
  }
  return bestScore >= 2 ? best : null;
}

function shortDescription(service, lang) {
  const description = serviceDescription(service, lang);
  if (description.length <= 280) return description;
  return `${description.slice(0, 277).replace(/\s+\S*$/, '')}…`;
}

export function composeAnswer({ message, lang = 'ru', history = [], services = [] }) {
  const L = normalizeLang(lang);
  const copy = T[L];
  const active = services.filter((service) => service && service.active !== false);
  if (active.length === 0) return { text: copy.empty, services: [] };

  const current = normalize(message);
  const pastUser = history
    .filter((item) => item?.role === 'user' && typeof item.text === 'string')
    .slice(-2)
    .map((item) => normalize(item.text))
    .join(' ');
  const context = `${current} ${pastUser}`.trim();

  const intent = detectIntent(current);
  const category = detectCategory(context);
  const service = findService(current, active, L) ?? findService(context, active, L);

  const budgetMatch = current.match(/(?:до|under|дейін|шешін)\s*(\d[\d\s]{2,6})/);
  if (budgetMatch) {
    const budget = Number(budgetMatch[1].replace(/\s/g, ''));
    const fits = active.filter((item) => item.price <= budget).sort((a, b) => a.price - b.price).slice(0, 4);
    if (fits.length) return { text: copy.priceUnder(money(budget, L), listText(fits, L)), services: fits };
    const cheapest = Math.min(...active.map((item) => item.price));
    return { text: copy.priceNone(money(budget, L), money(cheapest, L)), services: popular(active, 2) };
  }

  if (intent === 'booking') return { text: copy.booking, services: [] };

  if (intent === 'birthday') {
    const party = active.find((item) => CATEGORY_BY_NAME[item.category] === 'party');
    if (party) {
      return { text: copy.birthday(money(party.price, L), duration(party.duration_min, L)), services: [party] };
    }
  }

  if (service) {
    return {
      text: copy.service(serviceTitle(service, L), money(service.price, L), duration(service.duration_min, L), shortDescription(service, L)),
      services: [service],
    };
  }

  if (intent === 'price') {
    if (category) {
      const list = active.filter((item) => CATEGORY_BY_NAME[item.category] === category).slice(0, 4);
      return { text: copy.category(CATEGORY_LABELS[L][category], listText(list, L)), services: list };
    }
    const prices = active.map((item) => item.price);
    const top = popular(active, 3);
    return {
      text: `${copy.priceRange(money(Math.min(...prices), L), money(Math.max(...prices), L))}\n${listText(top, L)}`,
      services: top,
    };
  }

  if (category) {
    const list = active.filter((item) => CATEGORY_BY_NAME[item.category] === category).slice(0, 4);
    return { text: copy.category(CATEGORY_LABELS[L][category], listText(list, L)), services: list };
  }

  if (intent === 'recommend') {
    const top = popular(active, 3);
    return { text: `${copy.recommend}\n${listText(top, L)}`, services: top };
  }

  if (intent === 'age') return { text: copy.age, services: popular(active, 3) };
  if (intent === 'address') return { text: copy.address, services: [] };
  if (intent === 'schedule') return { text: copy.schedule, services: [] };
  if (intent === 'payment') return { text: copy.payment, services: [] };
  if (intent === 'cancel') return { text: copy.cancel, services: [] };
  if (intent === 'safety') return { text: copy.safety, services: [] };
  if (intent === 'reviews') return { text: copy.reviews, services: [] };
  if (intent === 'greeting') return { text: copy.greeting, services: [] };
  if (intent === 'thanks') return { text: copy.thanks, services: [] };

  return { text: copy.fallback, services: [] };
}
