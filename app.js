const DAY = 24 * 60 * 60 * 1000;
const sections = ["today", "calendar", "world", "search", "cities", "regions"];
const categories = ["Все", "Государственные", "Профессиональные", "История", "Именины", "Международные", "Другие"];
const scopes = ["Все", "События", "Города", "Субъекты"];
const today = new Date();
today.setHours(12, 0, 0, 0);
const state = {
  events: [], extras: [], cities: [], regions: [], manifest: null,
  selected: new Date(today), month: new Date(today.getFullYear(), today.getMonth(), 1, 12),
  category: "Все", worldCountry: "all", searchScope: "Все",
  page: "today", cityLimit: 24, regionLimit: 24, extraLimit: 16,
  featuredEvent: null, featuredCity: null, featuredWorld: null, favorites: new Set()
};

const $ = (id) => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const el = (name, className, text) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
};
const fmt = (date, options) => new Intl.DateTimeFormat("ru-RU", options).format(date);
const dateValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0")
].join("-");
const parseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const date = new Date(+match[1], +match[2] - 1, +match[3], 12);
  return dateValue(date) === value ? date : null;
};
const dateLabel = (date) => fmt(date, { day: "numeric", month: "long" });
const readableDate = (date) => fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fold = (text) => String(text || "").toLocaleLowerCase("ru").replaceAll("ё", "е");
const isToday = (d) => dateValue(d) === dateValue(today);
const countryName = (code) => {
  if (code === "INT") return "Международные даты";
  try { return new Intl.DisplayNames(["ru"], {type: "region"}).of(code) || code; }
  catch { return code; }
};
const flag = (code) => /^[A-Z]{2}$/.test(code || "")
  ? String.fromCodePoint(...code.split("").map((c) => 127397 + c.charCodeAt(0))) : "🌐";

function categoryGroup(e) {
  const cat = fold(e.category);
  if (cat.includes("именин") || cat.includes("имя") || cat.includes("православ")) return "Именины";
  if (cat.includes("истори") || cat.includes("памят") || cat.includes("событи")) return "История";
  if (cat.includes("профессион") || cat.includes("военн") || cat.includes("отрасл")) return "Профессиональные";
  if (cat.includes("государ") || cat.includes("официаль") || cat.includes("национал") || cat.includes("субъект") || cat.includes("регионал")) return "Государственные";
  if (cat.includes("международ") || cat.includes("всемир") || cat.includes("мир")) return "Международные";
  return "Другие";
}
function visualFor(e) {
  const c = categoryGroup(e);
  const by = {
    "Государственные": ["sand", "✦"],
    "Профессиональные": ["sky", "⚒"],
    "История": ["rose", "✧"],
    "Именины": ["mint", "❀"],
    "Международные": ["sky", "◈"],
    "Другие": ["mint", "☼"]
  };
  return by[c] || by["Другие"];
}
function assetFor(item) {
  const title = fold(item.title);
  const category = categoryGroup(item);
  if (item.regionSymbol) return "./" + item.regionSymbol;
  const specific = [
    [/(нефт|газов)/, "oil_gas"], [/(врач|медиц|здоров)/, "medical"],
    [/(строител|архитект)/, "builder"], [/(банков|финанс)/, "bank"],
    [/(пожарн|спасател)/, "firefighter"], [/(шахт|горняк)/, "miner"],
    [/(военн|армии|флот|солдат)/, "military"], [/(эколог|природ|земл)/, "ecology"],
    [/(пост|почт)/, "postal"], [/(космос|космонав|планет)/, "international"],
    [/(питомц|животн)/, "odd_pets"], [/(кошк|кот)/, "odd_cats"],
    [/(шоколад)/, "odd_chocolate"], [/(день смеха|дурак)/, "odd_fools"],
    [/(памят|скорб|погибш)/, "memorial"]
  ];
  for (const [pattern, key] of specific) if (pattern.test(title)) return "./assets/categories/" + key + ".webp";
  const defaults = {
    "Государственные": "anniversary",
    "Профессиональные": "prof_001",
    "История": "history",
    "Именины": "namedays",
    "Международные": "international",
    "Другие": "folk"
  };
  return "./assets/categories/" + (defaults[category] || "history") + ".webp";
}
function eventsOn(date) {
  return state.events.filter((e) => e.month === date.getMonth() + 1 && e.day === date.getDate() &&
    (e.year === null || e.year === date.getFullYear()));
}
function extrasOn(date) {
  if (date.getFullYear() !== 2026) return [];
  return state.extras.filter((e) => e.month === date.getMonth() + 1 && e.day === date.getDate() && e.year === 2026);
}
function citiesOn(date) {
  if (date.getFullYear() !== 2026) return [];
  return state.cities.filter((c) => c.dayOfCity?.year === 2026 &&
    c.dayOfCity.month === date.getMonth() + 1 && c.dayOfCity.day === date.getDate());
}
function upcomingEvents(from) {
  const list = [];
  for (let delta = 1; delta <= 45 && list.length < 12; delta += 1) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + delta, 12);
    for (const item of eventsOn(d).slice(0, 3)) list.push(item);
  }
  return list;
}
function rememberFavorites() {
  try { localStorage.setItem("dsm-a19-favorites", JSON.stringify([...state.favorites])); } catch {}
}
function restoreFavorites() {
  try { state.favorites = new Set(JSON.parse(localStorage.getItem("dsm-a19-favorites") || "[]")); }
  catch { state.favorites = new Set(); }
}
function applyTheme(theme, save = true) {
  const selected = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = selected;
  const toggle = $("themeToggle");
  toggle.querySelector(".theme-icon").textContent = selected === "dark" ? "☀" : "☾";
  toggle.setAttribute("aria-label", selected === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
  toggle.setAttribute("aria-pressed", String(selected === "dark"));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", selected === "dark" ? "#122327" : "#f7f8f3");
  if (save) try { localStorage.setItem("dsm-a19-theme", selected); } catch {}
}
let toastTimeout;
function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove("visible"), 2500);
}

function eventCard(item) {
  const [tone, symbol] = visualFor(item);
  const card = el("article", "event-card");
  card.dataset.tone = tone;
  if (item.regionSymbol) card.dataset.media = "region";
  const media = el("div", "event-media");
  const imageButton = el("button", "media-open");
  imageButton.type = "button";
  imageButton.setAttribute("aria-label", "Открыть событие: " + item.title);
  const picture = el("img", "event-image");
  picture.src = assetFor(item);
  picture.alt = "";
  picture.loading = "lazy";
  picture.decoding = "async";
  imageButton.append(picture);
  imageButton.addEventListener("click", () => openDetail(item, "event"));
  media.append(imageButton);
  media.append(el("span", "media-date", String(item.day) + " " +
    fmt(new Date(2026, item.month - 1, item.day, 12), {month: "long"})));
  const heart = el("button", "favorite-button" + (state.favorites.has(item.id) ? " active" : ""),
    state.favorites.has(item.id) ? "♥" : "♡");
  heart.type = "button";
  heart.setAttribute("aria-label", state.favorites.has(item.id) ? "Убрать из избранного" : "Добавить в избранное");
  heart.setAttribute("aria-pressed", String(state.favorites.has(item.id)));
  heart.addEventListener("click", () => {
    if (state.favorites.has(item.id)) state.favorites.delete(item.id);
    else state.favorites.add(item.id);
    rememberFavorites();
    heart.textContent = state.favorites.has(item.id) ? "♥" : "♡";
    heart.classList.toggle("active", state.favorites.has(item.id));
    heart.setAttribute("aria-pressed", String(state.favorites.has(item.id)));
    heart.setAttribute("aria-label", state.favorites.has(item.id) ? "Убрать из избранного" : "Добавить в избранное");
    toast(state.favorites.has(item.id) ? "Сохранено в избранном на этом устройстве" : "Удалено из избранного");
  });
  media.append(heart);
  const body = el("div", "event-body");
  const meta = el("div", "event-meta");
  meta.append(el("span", "category-tag", categoryGroup(item)));
  if (item.countryCode && item.countryCode !== "RU") {
    meta.append(el("span", "country-tag", flag(item.countryCode) + " " + countryName(item.countryCode)));
  }
  const title = el("h3", "", item.title);
  const description = el("p", "", item.description || "Информация об этом событии дополняется.");
  const foot = el("div", "card-foot");
  const read = el("button", "", "Узнать подробнее ↗");
  read.type = "button";
  read.addEventListener("click", () => openDetail(item, "event"));
  foot.append(read);
  const source = el("span", "source-flag", "?");
  source.title = item.sourceUrl ? "Есть ссылка на источник" : "Источник не указан в локальной копии";
  foot.append(source);
  body.append(meta, title, description, foot);
  card.append(media, body);
  return card;
}
function emptyState(title, subtitle) {
  const box = el("div", "empty-state");
  box.append(el("strong", "", title), el("span", "", subtitle));
  return box;
}
function renderFilters(container, labels, selected, callback) {
  const root = $(container);
  root.replaceChildren();
  for (const label of labels) {
    const button = el("button", "filter-pill" + (selected === label ? " active" : ""), label);
    button.type = "button";
    if (label !== "Все") {
      const iconName = {
        "Государственные": "anniversary", "Профессиональные": "prof_001",
        "История": "history", "Именины": "namedays",
        "Международные": "international", "Другие": "folk",
        "События": "history", "Города": "city", "Субъекты": "anniversary"
      }[label];
      if (iconName) {
        const img = el("img", "filter-icon");
        img.src = "./assets/categories/" + iconName + ".webp";
        img.alt = "";
        button.prepend(img);
      }
    }
    button.setAttribute("aria-pressed", String(selected === label));
    button.addEventListener("click", () => callback(label));
    root.append(button);
  }
}
function extraCard(item) {
  const button = el("button", "extra-card");
  button.type = "button";
  button.setAttribute("aria-label", "Дополнительная дата без проверки: " + item.title);
  const icon = el("img", "extra-icon");
  icon.src = "./" + (item.icon || item.categoryIcon || "assets/categories/folk.webp");
  icon.alt = "";
  icon.loading = "lazy";
  icon.addEventListener("error", () => { icon.onerror = null; icon.src = "./assets/categories/folk.webp"; });
  const copy = el("span", "extra-copy");
  copy.append(el("strong", "", item.title), el("small", "", "Дата из дополнительного каталога"));
  button.append(icon, copy, el("span", "extra-arrow", "↗"));
  button.addEventListener("click", () => openDetail(item, "extra"));
  return button;
}
function renderExtras() {
  const rows = extrasOn(state.selected);
  const section = $("extrasSection");
  section.hidden = rows.length === 0;
  setText("extrasCount", "· " + rows.length);
  const root = $("extrasCards");
  root.replaceChildren();
  for (const item of rows.slice(0, state.extraLimit)) root.append(extraCard(item));
  $("moreExtras").hidden = rows.length <= state.extraLimit;
}
function renderDiscover(date, all) {
  const featured = all.find((e) => e.isOfficial && e.description?.length > 50)
    || all.find((e) => categoryGroup(e) === "История" && e.description?.length > 60)
    || all.find((e) => e.description?.length > 60) || all[0] || upcomingEvents(date)[0] || null;
  state.featuredEvent = featured;
  setText("discoverTitle", featured?.title || "Истории ждут своей даты");
  setText("discoverDescription", featured?.description || "Выберите дату, чтобы увидеть интересные события.");
  $("discoverImage").src = featured ? assetFor(featured) : "./assets/categories/history.webp";
  $("discoverOpen").disabled = !featured;
  const dayCities = citiesOn(date).sort((a, b) => (b.population || 0) - (a.population || 0));
  const city = dayCities[0] || state.cities.find((c) => c.name === "Нижний Новгород") || state.cities[0] || null;
  state.featuredCity = city;
  setText("discoverCity", dayCities.length ? city?.name : "1 139 городов России");
  setText("discoverCityNote", dayCities.length
    ? "День города · " + (city?.region || "") + (dayCities.length > 1 ? " · и ещё " + (dayCities.length - 1) : "")
    : "Гербы, история и дни городов в одном каталоге");
  const world = all.find((e) => e.countryCode && e.countryCode !== "RU" &&
    categoryGroup(e) !== "История") || null;
  state.featuredWorld = world;
  setText("discoverWorld", world?.title || "Откройте события мира");
  setText("discoverWorldNote", world
    ? flag(world.countryCode) + " " + countryName(world.countryCode)
    : "Праздники, традиции и даты разных стран");
}
function renderToday() {
  const date = state.selected;
  const all = eventsOn(date);
  const filtered = all.filter((e) => state.category === "Все" || categoryGroup(e) === state.category);
  setText("heroHumanDate", readableDate(date));
  setText("artDayNumber", String(date.getDate()).padStart(2, "0"));
  setText("artMonth", fmt(date, {month: "long"}));
  $("selectedDate").value = dateValue(date);
  const isFallback = all.length === 0;
  const displayed = isFallback ? upcomingEvents(date) : filtered;
  setText("todayDescription", isFallback
    ? "В сохранённом каталоге пока нет событий на эту дату — показываем ближайшие"
    : "Собрали " + all.length + " событий, исторических фактов и памятных дат");
  setText("todayTotal", all.length);
  setText("todayHistory", all.filter((e) => categoryGroup(e) === "История").length);
  setText("todayNames", all.filter((e) => categoryGroup(e) === "Именины").length);
  setText("todayOfficial", all.filter((e) => categoryGroup(e) === "Государственные").length);
  renderDiscover(date, all);
  renderExtras();
  setText("todayState", isFallback ? "Ближайшие события — не события выбранного дня" :
    state.category !== "Все" ? "Найдено в категории: " + filtered.length : "");
  renderFilters("todayFilters", categories, state.category, (category) => {
    state.category = category; renderToday();
  });
  const root = $("todayCards");
  root.replaceChildren();
  if (!displayed.length) root.append(emptyState("Пока событий нет", "Попробуйте выбрать другую дату или категорию."));
  else displayed.slice(0, 42).forEach((e) => root.append(eventCard(e)));
}
function setSelectedDate(date) {
  state.selected = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  state.month = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  state.extraLimit = 16;
  renderToday(); renderCalendar();
}
function renderCalendar() {
  const first = state.month;
  const month = first.getMonth(), year = first.getFullYear();
  setText("monthName", fmt(first, {month: "long", year: "numeric"}));
  const grid = $("monthGrid");
  grid.replaceChildren();
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + days) / 7) * 7;
  for (let i = 0; i < total; i += 1) {
    const d = new Date(year, month, i - offset + 1, 12);
    const count = eventsOn(d).length;
    const differentMonth = d.getMonth() !== month;
    const button = el("button", "calendar-day");
    button.type = "button";
    button.role = "gridcell";
    if (differentMonth) button.classList.add("muted");
    if (d.getDay() === 0 || d.getDay() === 6) button.classList.add("weekend");
    if (count) button.classList.add("has-events");
    if (isToday(d)) button.classList.add("is-today");
    if (dateValue(d) === dateValue(state.selected)) button.classList.add("selected");
    button.setAttribute("aria-label", readableDate(d) + ", событий: " + count);
    button.setAttribute("aria-selected", String(dateValue(d) === dateValue(state.selected)));
    button.append(el("b", "", d.getDate()));
    button.append(el("small", "", count ? String(count) + " событий" : "·"));
    button.addEventListener("click", () => setSelectedDate(d));
    grid.append(button);
  }
  setText("calendarDayTitle", dateLabel(state.selected));
  const list = eventsOn(state.selected);
  setText("calendarDayCount", list.length + " событий в локальном каталоге");
  const root = $("calendarEvents");
  root.replaceChildren();
  if (!list.length) root.append(emptyState("Нет записей на дату", "Каталог ещё восстанавливается."));
  for (const e of list.slice(0, 25)) {
    const button = el("button", "compact-event");
    button.type = "button";
    button.append(el("strong", "", e.title), el("small", "", categoryGroup(e)));
    button.addEventListener("click", () => openDetail(e, "event"));
    root.append(button);
  }
  const extras = extrasOn(state.selected);
  const side = $("calendarExtras");
  side.replaceChildren();
  if (extras.length) {
    side.append(el("h3", "", "Ещё отмечают · " + extras.length));
    side.append(el("p", "", "Дополнительные даты без подтверждённых источников"));
    for (const item of extras.slice(0, 10)) side.append(extraCard(item));
    if (extras.length > 10) {
      const more = el("button", "calendar-see-all", "Показать все дополнительные даты ↗");
      more.type = "button";
      more.addEventListener("click", () => {
        location.hash = "#today";
        requestAnimationFrame(() => $("extrasSection").scrollIntoView({behavior:"smooth"}));
      });
      side.append(more);
    }
  }
}
function renderWorld() {
  const rows = state.events.filter((e) => e.countryCode && e.countryCode !== "RU" &&
    categoryGroup(e) !== "История" &&
    (e.year === null || e.year === state.selected.getFullYear()));
  const codes = [...new Set(rows.map((e) => e.countryCode))]
    .sort((a,b) => countryName(a).localeCompare(countryName(b), "ru"));
  const select = $("worldCountry");
  select.replaceChildren(new Option("Все страны", "all"));
  for (const code of codes) select.add(new Option(flag(code) + " " + countryName(code), code));
  select.value = state.worldCountry;
  const visible = rows.filter((e) => state.worldCountry === "all" || e.countryCode === state.worldCountry);
  setText("worldCount", visible.length + " событий · " + codes.length + " стран в локальном каталоге");
  const root = $("worldCards");
  root.replaceChildren();
  if (!visible.length) root.append(emptyState("Ничего не найдено", "Попробуйте выбрать другую страну."));
  visible.slice(0, 90).forEach((e) => root.append(eventCard(e)));
}
function directoryCard(record, kind) {
  const button = el("button", "directory-card");
  button.type = "button";
  const symbol = el("span", "directory-symbol");
  const image = el("img", "directory-image");
  image.src = kind === "region" ? (record.coat || record.flag || "./assets/categories/anniversary.webp")
    : (record.coatUrl || "./assets/categories/city.webp");
  image.alt = "";
  image.loading = "lazy";
  if (kind === "city" && record.coatUrl) image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    if (image.src.endsWith("/city.webp")) return;
    image.onerror = null;
    image.src = "./assets/categories/" + (kind === "region" ? "anniversary" : "city") + ".webp";
  });
  symbol.append(image);
  if (kind === "region") symbol.classList.add("region-symbol");
  const copy = el("span", "directory-copy");
  copy.append(el("strong", "", kind === "city" ? record.name : record.name));
  copy.append(el("span", "", kind === "city" ?
    record.region + (record.population ? " · " + record.population.toLocaleString("ru-RU") + " жителей" : "") :
    (record.citiesCount ? record.citiesCount + " городов в локальном каталоге" : "Города пока не добавлены в справочник")));
  if (kind === "city" && record.dayOfCity?.year === 2026) {
    copy.append(el("small", "directory-date", "День города в 2026: " +
      dateLabel(new Date(2026, record.dayOfCity.month - 1, record.dayOfCity.day, 12))));
  }
  button.append(symbol, copy, el("span", "directory-arrow", "↗"));
  button.addEventListener("click", () => openDetail(record, kind));
  return button;
}
function renderCities() {
  const query = fold($("citySearch").value.trim());
  const list = state.cities.filter((c) => fold(c.name).includes(query) || fold(c.region).includes(query));
  setText("citiesCount", list.length.toLocaleString("ru-RU") + " городов · локальный справочник");
  const root = $("cityCards");
  root.replaceChildren();
  if (!list.length) root.append(emptyState("Город не найден", "Проверьте название или попробуйте поиск по региону."));
  list.slice(0, state.cityLimit).forEach((c) => root.append(directoryCard(c, "city")));
  $("moreCities").hidden = list.length <= state.cityLimit;
}
function renderRegions() {
  const query = fold($("regionSearch").value.trim());
  const list = state.regions.filter((r) => fold(r.name).includes(query));
  setText("regionsCount", list.length + " субъектов · на основе справочника городов");
  const root = $("regionCards");
  root.replaceChildren();
  if (!list.length) root.append(emptyState("Субъект не найден", "Попробуйте другое название."));
  list.slice(0, state.regionLimit).forEach((r) => root.append(directoryCard(r, "region")));
  $("moreRegions").hidden = list.length <= state.regionLimit;
}
function renderSearch() {
  renderFilters("searchScopes", scopes, state.searchScope, (scope) => {
    state.searchScope = scope; renderSearch();
  });
  const query = fold($("globalSearch").value.trim());
  const root = $("searchResults");
  root.replaceChildren();
  if (query.length < 2) {
    setText("searchCount", "Введите минимум 2 символа");
    root.append(emptyState("Что найдём сегодня?", "Например: космос, учитель, Москва или День Победы."));
    return;
  }
  const found = [];
  if (state.searchScope === "Все" || state.searchScope === "События")
    for (const e of state.events) if ((e.year === null || e.year === state.selected.getFullYear()) &&
      fold(e.title + " " + e.description + " " + e.category).includes(query)) found.push(["event",e]);
  if ((state.searchScope === "Все" || state.searchScope === "События") && state.selected.getFullYear() === 2026)
    for (const e of state.extras) if (fold(e.title + " " + e.type).includes(query)) found.push(["extra",e]);
  if (state.searchScope === "Все" || state.searchScope === "Города")
    for (const c of state.cities) if (fold(c.name + " " + c.region + " " + c.description + " " + (c.aliases || []).join(" ")).includes(query)) found.push(["city",c]);
  if (state.searchScope === "Все" || state.searchScope === "Субъекты")
    for (const r of state.regions) if (fold(r.name).includes(query)) found.push(["region",r]);
  setText("searchCount", found.length + " результатов");
  if (!found.length) root.append(emptyState("Совпадений не найдено", "Попробуйте другое слово или выберите «Все»."));
  for (const [type, item] of found.slice(0, 90)) {
    root.append(type === "event" ? eventCard(item) : type === "extra" ? extraCard(item) : directoryCard(item,type));
  }
}
function openDetail(item, type) {
  const root = $("dialogBody");
  root.replaceChildren();
  if (type === "extra") {
    const heading = el("div", "detail-heading extra-detail-heading");
    const image = el("img", "detail-cover");
    image.src = "./" + (item.icon || item.categoryIcon || "assets/categories/folk.webp");
    image.alt = "Тематический ярлык дополнительной даты";
    image.onerror = () => { image.onerror = null; image.src = "./assets/categories/folk.webp"; };
    const copy = el("div", "detail-heading-copy");
    copy.append(el("div", "dialog-meta", dateLabel(new Date(2026, item.month - 1, item.day, 12)) + " · " + item.type), el("h2", "", item.title));
    copy.querySelector("h2").id = "dialogTitle";
    heading.append(image, copy);
    root.append(heading);
    const caution = el("div", "extra-verification", "Дополнительная дата. Сведения и источники ещё не проверены редакцией проекта — это не подтверждённое событие основного календаря.");
    root.append(caution);
    const title = el("h3", "", "Упоминания в открытых календарях");
    root.append(title);
    const sources = (item.sources || []).filter((source) => /^https:\/\//.test(source.url || ""));
    if (!sources.length) root.append(el("p", "detail-source-empty", "Ссылки на первичные источники пока отсутствуют."));
    for (const source of sources.slice(0, 5)) {
      const link = el("a", "dialog-source", new URL(source.url).hostname + " ↗");
      link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      root.append(link);
    }
    if (typeof $("detailDialog").showModal === "function") $("detailDialog").showModal();
    return;
  }
  const heading = el("div", "detail-heading");
  const image = el("img", "detail-cover");
  image.alt = type === "event" ? "Иллюстрация категории события" :
    type === "region" ? "Символика региона" : "Иллюстрация города";
  image.src = type === "event" ? assetFor(item) :
    type === "region" ? (item.coat || item.flag || "./assets/categories/anniversary.webp") :
      "./assets/categories/city.webp";
  heading.append(image);
  const headingCopy = el("div", "detail-heading-copy");
  const title = type === "event" ? item.title : item.name;
  const meta = type === "event"
    ? dateLabel(new Date(item.year || state.selected.getFullYear(), item.month - 1, item.day, 12)) + " · " + item.category +
      (item.countryCode && item.countryCode !== "RU" ? " · " + countryName(item.countryCode) : "")
    : type === "city" ? item.region + (item.population ? " · " + item.population.toLocaleString("ru-RU") + " жителей" : "")
    : item.citiesCount ? item.citiesCount + " городов в каталоге" : "Города пока не добавлены в справочник";
  headingCopy.append(el("div", "dialog-meta", meta), el("h2", "", title));
  headingCopy.querySelector("h2").id = "dialogTitle";
  heading.append(headingCopy);
  root.append(heading);
  if (type === "region" && item.flag && item.coat) {
    const symbols = el("div", "detail-symbols");
    for (const [src, text] of [[item.flag,"Флаг"],[item.coat,"Герб"]]) {
      const figure = el("figure");
      const img = el("img");
      img.src = "./" + src;
      img.alt = text + " региона";
      figure.append(img, el("figcaption","",text));
      symbols.append(figure);
    }
    root.append(symbols);
  }
  const blocks = type === "event" ?
    [["О событии", item.description],["История", item.history],["Почему это важно", item.meaning],
      ["Традиции", item.traditions],["Интересный факт", item.interestingFact]] :
    type === "city" ?
      [["О городе", item.description],["История", item.history],["Почему это важно", item.meaning],
        ["Традиции", item.traditions],["Интересный факт", item.interestingFact],
        ["День города в 2026 году", item.dayOfCity?.year === 2026 ?
          dateLabel(new Date(2026, item.dayOfCity.month - 1, item.dayOfCity.day, 12)) +
          (item.dateEvidence ? ". " + item.dateEvidence : ". Дата из восстановленного справочника, может требовать уточнения.") : null]] :
      [["О регионе", item.meaning || item.description],["История", item.history || item.description],
        ["Регион в цифрах", item.interestingFact],["Основание даты", item.legalBasis]];
  let previous = "";
  for (const [label, value] of blocks) {
    if (!value || value === previous) continue;
    const block = el("section", "detail-section");
    block.append(el("h3","",label), el("p","",value));
    root.append(block);
    previous = value;
  }
  if (!root.querySelector(".detail-section")) {
    const block = el("section","detail-section");
    block.append(el("p","","Подробности дополняются по мере восстановления локального каталога."));
    root.append(block);
  }
  if (type === "event" && !item.images?.length) {
    root.append(el("p","detail-media-note","Это сохранённая тематическая иллюстрация. Четыре оригинальных изображения события подключим из резервной копии, когда она станет доступна."));
  }
  const sourceUrl = type === "city" && item.dayOfCity?.sourceUrl ? item.dayOfCity.sourceUrl : item.sourceUrl || null;
  if (sourceUrl && /^https:\/\//.test(sourceUrl)) {
    const a = el("a", "dialog-source", type === "city" ? "Источник даты Дня города ↗" : "Открыть источник ↗");
    a.href = sourceUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
    root.append(a);
  } else if (type === "event") {
    root.append(el("span","detail-source-empty","Без проверенного источника в сохранённой базе"));
  }
  const dialog = $("detailDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
}
function route() {
  const hash = location.hash.slice(1).split("?")[0];
  const page = sections.includes(hash) ? hash : "today";
  state.page = page;
  for (const name of sections) $(name).hidden = name !== page;
  document.querySelectorAll("[data-nav]").forEach((node) => {
    node.classList.toggle("active", node.dataset.nav === page);
    if (node.dataset.nav === page) node.setAttribute("aria-current","page");
    else node.removeAttribute("aria-current");
  });
  const nav = document.querySelector(".primary-nav");
  nav.classList.remove("open");
  $("menuToggle").setAttribute("aria-expanded", "false");
  if (page === "today") renderToday();
  if (page === "calendar") renderCalendar();
  if (page === "world") renderWorld();
  if (page === "search") renderSearch();
  if (page === "cities") renderCities();
  if (page === "regions") renderRegions();
  window.scrollTo({top:0,behavior:"instant"});
}
function wire() {
  restoreFavorites();
  applyTheme(document.documentElement.dataset.theme, false);
  $("themeToggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  $("copyrightYear").textContent = new Date().getFullYear();
  $("openSearch").addEventListener("click", () => { location.hash = "#search"; $("globalSearch").focus(); });
  $("menuToggle").addEventListener("click", () => {
    const open = document.querySelector(".primary-nav").classList.toggle("open");
    $("menuToggle").setAttribute("aria-expanded", String(open));
  });
  $("scrollToday").addEventListener("click", () => $("todayFeed").scrollIntoView({behavior:"smooth"}));
  $("discoverOpen").addEventListener("click", () => {
    if (state.featuredEvent) openDetail(state.featuredEvent, "event");
  });
  $("discoverCityOpen").addEventListener("click", () => {
    if (state.featuredCity) openDetail(state.featuredCity, "city");
    else location.hash = "#cities";
  });
  $("discoverWorldOpen").addEventListener("click", () => {
    if (state.featuredWorld) openDetail(state.featuredWorld, "event");
    else location.hash = "#world";
  });
  $("moreExtras").addEventListener("click", () => {
    state.extraLimit += 24;
    renderExtras();
  });
  $("resetToday").addEventListener("click", () => {
    state.category = "Все";
    setSelectedDate(today);
    toast("Фильтры и дата сброшены");
  });
  $("backToTop").addEventListener("click", () => window.scrollTo({top:0,behavior:"smooth"}));
  window.addEventListener("scroll", () => {
    $("backToTop").hidden = window.scrollY < 500;
  }, {passive:true});
  $("heroCalendar").addEventListener("click", () => location.hash = "#calendar");
  $("previousDay").addEventListener("click", () => setSelectedDate(new Date(state.selected.getTime() - DAY)));
  $("nextDay").addEventListener("click", () => setSelectedDate(new Date(state.selected.getTime() + DAY)));
  $("selectedDate").addEventListener("change", (event) => {
    const date = parseDate(event.target.value);
    if (date) setSelectedDate(date);
  });
  $("previousMonth").addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(),state.month.getMonth()-1,1,12);
    renderCalendar();
  });
  $("nextMonth").addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(),state.month.getMonth()+1,1,12);
    renderCalendar();
  });
  $("jumpToday").addEventListener("click", () => setSelectedDate(today));
  $("worldCountry").addEventListener("change", (e) => {
    state.worldCountry = e.target.value; renderWorld();
  });
  $("globalSearch").addEventListener("input", renderSearch);
  $("clearSearch").addEventListener("click", () => {
    $("globalSearch").value = ""; renderSearch(); $("globalSearch").focus();
  });
  $("citySearch").addEventListener("input", () => { state.cityLimit=24; renderCities(); });
  $("regionSearch").addEventListener("input", () => { state.regionLimit=24; renderRegions(); });
  $("moreCities").addEventListener("click", () => { state.cityLimit+=24; renderCities(); });
  $("moreRegions").addEventListener("click", () => { state.regionLimit+=24; renderRegions(); });
  window.addEventListener("hashchange", route);
}
async function init() {
  wire();
  try {
    const paths = ["events", "cities", "regions", "manifest", "extras"];
    const values = await Promise.all(paths.map(async (p) => {
      const response = await fetch("./data/" + p + ".json", {cache:"no-store"});
      if (!response.ok) throw new Error("Не удалось загрузить " + p);
      return response.json();
    }));
    [state.events, state.cities, state.regions, state.manifest] = values;
    state.extras = Array.isArray(values[4]?.items) ? values[4].items.filter((item) => item.verified === false) : [];
    route();
  } catch (error) {
    console.error(error);
    document.querySelectorAll(".view").forEach((v) => v.hidden = v.id !== "today");
    $("todayCards").replaceChildren(emptyState("Не удалось загрузить локальную базу",
      "Запустите сайт через start-preview.cmd. Открытие index.html напрямую не поддерживается."));
    setText("todayState", "Ошибка загрузки: " + error.message);
  }
}
init();
