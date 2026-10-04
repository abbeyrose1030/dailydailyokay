const $ = (id) => document.getElementById(id);

const els = {
  month: $("month"),
  day: $("day"),
  weekday: $("weekday"),
  clock: $("clock"),
  meta: $("meta"),
  year: $("year"),
  ago: $("ago"),
  fact: $("fact"),
  frame: $("frame"),
  photo: $("photo"),
  controls: $("controls"),
  count: $("count"),
  prev: $("prev"),
  next: $("next"),
  retry: $("retry"),
  source: $("source"),
  creditDot: $("credit-dot"),
  almanac: $("almanac"),
  slate: $("slate"),
};

const GRIM = /\b(kill(?:ed|ing)?|deaths?|died|dead|massacre|murder(?:ed)?|sank|sunk|suicide|genocide|execut(?:ed|ion)|bomb(?:ed|ing)?|airstrike|starv(?:e|ed|ation)|maul(?:ed)?|assassinat(?:ed|ion)|overthrow|invad(?:e|ed|ing)|invasion|coup|crash(?:ed)?|missing|nuclear|wars?|battle|strike|prisoners?|hunger|weapon)\b/i;
const LIVELY = /\b(first|launch(?:ed)?|discover(?:ed|y)?|invent(?:ed)?|founded|award(?:ed)?|won|wins?|opened|dedicated|published|premiere[ds]?|record|composed|elected|established|introduced|released|completed|crewed)\b/i;

let records = [];
let cursor = 0;
let activeKey = "";
let touchX = null;

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateParts(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return {
    date,
    key: `${date.getFullYear()}-${pad(month)}-${pad(day)}`,
    api: `${pad(month)}/${pad(day)}`,
  };
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function yearsAgo(year) {
  const n = new Date().getFullYear() - Number(year);
  if (n <= 0) return "This year";
  if (n === 1) return "1 year ago";
  return `${n} years ago`;
}

function score(event) {
  const text = event.text || "";
  const age = new Date().getFullYear() - Number(event.year || 0);
  let value = 0;
  if (age >= 25 && age <= 120) value += 5;
  else if (age > 120 && age <= 500) value += 3;
  else if (age >= 10) value += 2;
  if (LIVELY.test(text)) value += 4;
  if (GRIM.test(text)) value -= 7;
  if (text.length >= 80 && text.length <= 340) value += 2;
  if ((event.pages || []).some((page) => page.thumbnail && page.thumbnail.source)) value += 1;
  return value;
}

function featuredIndex(events) {
  let best = 0;
  let bestScore = -Infinity;
  events.forEach((event, index) => {
    const value = score(event);
    if (value > bestScore) {
      bestScore = value;
      best = index;
    }
  });
  return best;
}

function renderChrome(date = new Date()) {
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  const dayNum = date.getDate();
  els.month.textContent = monthName;
  els.day.textContent = String(dayNum);
  els.weekday.textContent = date.toLocaleDateString("en-US", { weekday: "long" });
  els.clock.textContent = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  els.almanac.href = `https://en.wikipedia.org/wiki/${monthName}_${dayNum}`;
  els.almanac.textContent = `${monthName} ${dayNum} on Wikipedia`;
  document.title = `${monthName} ${dayNum} — Daymark`;
}

function pack(events) {
  return events.map((event) => ({
    year: event.year,
    text: event.text,
    pages: (event.pages || []).slice(0, 3).map((page) => ({
      title: page.title,
      description: page.description,
      thumbnail: page.thumbnail ? { source: page.thumbnail.source } : null,
      content_urls: page.content_urls && page.content_urls.desktop && page.content_urls.desktop.page
        ? { desktop: { page: page.content_urls.desktop.page } }
        : null,
    })),
  }));
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) && data.length ? data : null;
  } catch {
    return null;
  }
}

function writeCache(key, events) {
  try {
    localStorage.setItem(key, JSON.stringify(events));
  } catch {
    /* A full disk should not block the record itself. */
  }
}

function article(event) {
  return (event.pages || []).find((page) => page.content_urls && page.content_urls.desktop) || (event.pages || [])[0] || null;
}

function showSource(page) {
  const href = page && page.content_urls && page.content_urls.desktop && page.content_urls.desktop.page;
  if (!href) {
    els.source.hidden = true;
    els.creditDot.hidden = true;
    return;
  }
  els.source.hidden = false;
  els.creditDot.hidden = false;
  els.source.href = href;
  const title = clean(String(page.title || "").replace(/_/g, " "));
  els.source.textContent = title || "Read the account";
}

function renderRecord() {
  const event = records[cursor];
  if (!event) return;
  const page = (event.pages || []).find((item) => item.thumbnail && item.thumbnail.source) || article(event);

  els.meta.hidden = false;
  els.controls.hidden = records.length < 2;
  els.retry.hidden = true;
  els.year.textContent = String(event.year);
  els.ago.textContent = yearsAgo(event.year);
  els.fact.textContent = clean(event.text);
  els.count.textContent = `${pad(cursor + 1)}  /  ${pad(records.length)}`;
  els.prev.disabled = records.length < 2;
  els.next.disabled = records.length < 2;
  showSource(article(event));

  if (page && page.thumbnail && page.thumbnail.source) {
    els.frame.hidden = false;
    els.photo.alt = clean(page.description || (page.title || "").replace(/_/g, " ") || "Illustration from the record");
    els.photo.src = page.thumbnail.source;
  } else {
    els.frame.hidden = true;
    els.photo.removeAttribute("src");
  }
}

function showMessage(message, canRetry) {
  records = [];
  els.meta.hidden = true;
  els.controls.hidden = true;
  els.frame.hidden = true;
  els.source.hidden = true;
  els.creditDot.hidden = true;
  els.fact.textContent = message;
  els.retry.hidden = !canRetry;
}

async function loadRecords() {
  const parts = dateParts();
  activeKey = parts.key;
  renderChrome(parts.date);
  els.retry.hidden = true;
  els.meta.hidden = true;
  els.controls.hidden = true;
  els.frame.hidden = true;
  els.fact.textContent = "Searching the record for this date…";

  const cacheKey = `daymark-records:${parts.key}`;
  const cached = readCache(cacheKey);
  if (cached) {
    records = cached;
    cursor = featuredIndex(records);
    renderRecord();
    return;
  }

  if (location.protocol === "file:") {
    showMessage("Open Start Daymark so today’s record can be reached.", false);
    return;
  }

  try {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${parts.api}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }
    );
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const events = pack((data.selected || []).filter((event) => event && event.text));
    if (!events.length) throw new Error("empty");
    records = events;
    writeCache(cacheKey, records);
    cursor = featuredIndex(records);
    renderRecord();
  } catch {
    showMessage("The record is out of reach. Try again when the wind settles.", true);
  }
}

function step(direction) {
  if (records.length < 2) return;
  cursor = (cursor + direction + records.length) % records.length;
  renderRecord();
}

els.prev.addEventListener("click", () => step(-1));
els.next.addEventListener("click", () => step(1));
els.retry.addEventListener("click", () => loadRecords());

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") step(1);
  if (event.key === "ArrowLeft") step(-1);
});

els.slate.addEventListener("touchstart", (event) => {
  touchX = event.changedTouches[0].clientX;
}, { passive: true });

els.slate.addEventListener("touchend", (event) => {
  if (touchX == null) return;
  const delta = event.changedTouches[0].clientX - touchX;
  if (delta > 48) step(-1);
  if (delta < -48) step(1);
  touchX = null;
}, { passive: true });

els.photo.addEventListener("error", () => {
  els.frame.hidden = true;
});

renderChrome();
loadRecords();

setInterval(() => {
  const parts = dateParts();
  renderChrome(parts.date);
  if (parts.key !== activeKey) loadRecords();
}, 10000);
