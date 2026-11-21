"use strict";
// Public site: renders data.json (written by `radio-miner publish`).
// Stations get no colours of their own. The one accent always means
// "German"; everything else is shades of ink.
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const fmt = new Intl.NumberFormat("de-DE");
const fmt1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const regionNames = new Intl.DisplayNames(["de"], { type: "region" });
const langNames = new Intl.DisplayNames(["de"], { type: "language" });
const pct = (x) => (x == null ? "–" : `${fmt1.format(x * 100)} %`);
const NUMBERS = ["Kein", "Ein", "Zwei", "Drei", "Vier", "Fünf", "Sechs", "Sieben", "Acht", "Neun", "Zehn", "Elf", "Zwölf"];
const TOP_SHOWN = 10;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
function svg(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function country(code) {
  if (code === "XW") return "weltweit";
  try { return regionNames.of(code) || code; } catch { return code; }
}
function language(code) {
  try { return langNames.of(code) || code; } catch { return code; }
}
function age(months) {
  if (months == null) return "–";
  if (months < 1) return "unter 1 Monat";
  if (months < 24) return `${months} ${months === 1 ? "Monat" : "Monate"}`;
  return `${fmt1.format(Math.round(months / 6) / 2).replace(/,0$/, "")} Jahre`;
}
function date(iso, opts = { day: "numeric", month: "long", year: "numeric" }) {
  return new Date(iso).toLocaleDateString("de-DE", opts);
}
const short = (iso) => date(iso, { day: "numeric", month: "short" });
// [21, 22, 23, 0, 1] -> "21–2 Uhr"; separate runs joined with "und"
function hourRanges(hours) {
  if (!hours.length) return "";
  const set = new Set(hours), runs = [];
  const start = hours.find((h) => !set.has((h + 23) % 24));
  if (start === undefined) return "rund um die Uhr";
  for (let i = 0; i < 24; i++) {
    const h = (start + i) % 24;
    if (set.has(h) && !set.has((h + 23) % 24)) runs.push([h, h]);
    if (set.has(h)) runs[runs.length - 1][1] = h;
  }
  return runs.map(([a, b]) => `${a}–${(b + 1) % 24} Uhr`).join(" und ");
}
const shade = (a) => `rgba(var(--data-rgb),${a.toFixed(2)})`;
const byGerman = (a, b) => (b.german_lyrics ?? -1) - (a.german_lyrics ?? -1);

let D, NAME, RANGE;

function render(d) {
  // stations without a playlist in the window yet are left out; one order everywhere
  d.stations = d.stations.filter((s) => s.plays_per_day != null).sort(byGerman);
  D = d;
  NAME = Object.fromEntries(d.stations.map((s) => [s.id, s.name]));
  RANGE = `${short(d.start)} bis ${date(d.end)}`;
  $("loading").hidden = true;
  for (const s of document.querySelectorAll("section")) s.hidden = false; // charts measure their width
  header(d);
  dial(d);
  compareTable(d);
  trend(d);
  mix("languages");
  hours(d);
  topList("songs");
  numberOnes(d);
  overlap(d);
  quality(d);
}

// "gut 18", "knapp 5", "34": a share as a rounded percentage that stays honest
function about(x) {
  const f = x * 100, r = Math.round(f);
  return `${f - r > 0.15 ? "gut " : r - f > 0.15 ? "knapp " : ""}${r}`;
}

function header(d) {
  const t = d.totals;
  const de = d.stations.filter((s) => s.german_lyrics != null);
  const rot = d.stations.filter((s) => s.rotation != null).sort((a, b) => b.rotation - a.rotation)[0];
  const lede = [];
  if (de.length > 1) {
    const hi = de[0], lo = de[de.length - 1]; // stations are sorted by German lyrics
    lede.push(`${hi.name} spielt von allen ${String(NUMBERS[de.length] || de.length).toLowerCase()} Sendern am meisten ` +
      `Musik mit deutschem Text, ${about(hi.german_lyrics)} Prozent der Songs. Bei ${lo.name} sind es ${about(lo.german_lyrics)}.`);
  }
  if (rot) {
    lede.push(`Die meisten Wiederholungen gibt es bei ${rot.name}: Dort machen die ${d.rotation_top} meistgespielten ` +
      `Songs ${about(rot.rotation)} Prozent des Programms aus.`);
  }
  if (lede.length) $("lede").textContent = lede.join(" ");
  const stand = new Date(d.generated_at).toLocaleString("de-DE", { day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit" });
  $("updated").textContent = `Stand ${stand} Uhr`;
  $("stamp").textContent = `Die letzten ${d.days} Tage, ${RANGE}`;
  $("foot-stamp").textContent = `In der Datenbank: ${fmt.format(t.plays)} gespielte Songs, ${fmt.format(t.songs)} ` +
    `verschiedene Titel, ${fmt.format(t.artists)} Künstler:innen. Wie weit die Playlists zurückreichen, ist je Sender ` +
    `verschieden, der älteste Eintrag stammt vom ${date(t.since)}.`;
}

// --- the dial: stations as needles on one scale of German lyrics ----------------
const DIAL_ROW = 32;

function dial(d) {
  const rows = d.stations.filter((s) => s.german_lyrics != null);
  if (!rows.length) return;
  const top = Math.max(0.05, Math.ceil((Math.max(...rows.map((s) => s.german_lyrics)) + 0.02) / 0.05) * 0.05);
  const steps = Math.round(top * 100);
  const pos = (v) => (v / top) * 100;
  const ticks = [], nums = [];
  for (let i = 0; i <= steps; i++) {
    const major = i % 5 === 0;
    ticks.push(el("i", { class: major ? "major" : "", style: `left:${(i / steps) * 100}%` }));
    if (major) nums.push(el("span", { style: `left:${(i / steps) * 100}%` }, `${i} %`));
  }
  $("dial-ticks").replaceChildren(...ticks);
  $("dial-nums").replaceChildren(...nums);
  const marks = $("dial-marks");
  const items = rows.map((s) => {
    const m = el("div", { class: "dial-mark", style: `left:${pos(s.german_lyrics)}%` },
      el("span", { class: "dial-label" }, el("b", {}, s.name), pct(s.german_lyrics)));
    return [s.german_lyrics, m];
  }).sort((a, b) => a[0] - b[0]);
  marks.replaceChildren(...items.map(([, m]) => m));
  // phones: the same scale, one row per station
  const grid = `${(5 / steps) * 100}%`;
  $("dial-list").replaceChildren(...[...rows].sort(byGerman).map((s) => el("div", { class: "dial-row" },
    el("span", { class: "name" }, s.name),
    el("span", { class: "track", style: `background-size:${grid} 100%` },
      el("i", { style: `left:${pos(s.german_lyrics)}%` })),
    el("span", { class: "val" }, pct(s.german_lyrics)))));
  $("dial-range").textContent = `letzte ${d.days} Tage`;
  $("dial").hidden = false;
  // Stack labels in rows, rightmost first, so that no label touches another
  // label or crosses a needle. A label that would run off the right edge
  // hangs left of its needle.
  const layout = () => {
    const W = marks.clientWidth, placed = [], GAP = 8;
    let used = 1;
    for (const [v, m] of [...items].reverse()) {
      const x = (pos(v) / 100) * W, w = m.firstChild.offsetWidth + 8;
      const flip = x + w > W && x - w >= 0;
      m.classList.toggle("flip", flip);
      const a = flip ? x - w : x, b = flip ? x : x + w;
      // where the text sits; a needle at the very edge of a label is fine
      const ta = flip ? a : a + 6, tb = flip ? b - 6 : b;
      const fits = (r) => placed.every((p) => p.r !== r || a >= p.b + GAP || b <= p.a - GAP);
      const clear = (r) => placed.every((p) =>
        (p.r <= r || p.x < ta || p.x > tb) && // a taller needle through this label
        (p.r >= r || x < p.ta || x > p.tb)); // this needle through a lower label
      // rows above every placed label always fit, so both searches end
      let r = 0;
      while (r <= placed.length && !(fits(r) && clear(r))) r++;
      if (r > placed.length) for (r = 0; !fits(r); r++);
      placed.push({ x, a, b, ta, tb, r });
      m.style.height = `${(r + 1) * DIAL_ROW}px`;
      used = Math.max(used, r + 1);
    }
    marks.style.height = `${used * DIAL_ROW}px`;
  };
  layout();
  let raf = 0;
  addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); });
}

// --- one table instead of rankings and station cards ---------------------------
let sortKey = "german_lyrics", sortDir = -1;

function columns(d) {
  return [
    { key: "german_lyrics", label: "Deutsch gesungen", f: pct, de: true },
    { key: "german_artists", label: "Acts aus Deutschland", f: pct, de: true },
    { key: "new_share", label: "Jünger als ein Jahr", f: pct },
    { key: "rotation", label: `Top-${d.rotation_top}-Anteil`, f: pct },
    { key: "median_age_months", label: "Typisches Songalter", f: age },
    { key: "plays_per_day", label: "Songs pro Tag", f: (v) => fmt.format(Math.round(v)) },
    { key: "songs", label: "Verschiedene Songs", f: (v) => fmt.format(v) },
  ];
}

function caveats(s, d) {
  const out = [];
  if (s.no_playlist_hours.length) out.push(`keine Playlist für ${hourRanges(s.no_playlist_hours)}`);
  if (s.coverage < 0.8) out.push(`Playlist nur für ${Math.round(s.coverage * d.days)} der ${d.days} Tage`);
  return out;
}

function compareTable(d) {
  const notes = [], noteOf = {};
  for (const s of d.stations) {
    const c = caveats(s, d);
    if (c.length) { notes.push(`${s.name}: ${c.join(", ")}.`); noteOf[s.id] = notes.length; }
  }
  $("footnotes").replaceChildren(...notes.map((n) => el("li", {}, n)));
  $("define").textContent = `Top-${d.rotation_top}-Anteil: wie viel ihres Programms die ${d.rotation_top} meistgespielten ` +
    `Songs eines Senders ausmachen. Typisches Songalter: Median der Zeit seit Erscheinen. ` +
    `Spaltenköpfe sortieren.`;
  drawTable(noteOf);
}

function drawTable(noteOf) {
  const cols = columns(D);
  const rows = [...D.stations].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sortDir;
  });
  const head = el("tr", {}, el("th", { scope: "col" }, "Sender"), ...cols.map((c) => {
    const th = el("th", { scope: "col" });
    if (c.key === sortKey) th.setAttribute("aria-sort", sortDir < 0 ? "descending" : "ascending");
    const b = el("button", { type: "button" }, c.label);
    b.addEventListener("click", () => {
      sortDir = c.key === sortKey ? -sortDir : -1;
      sortKey = c.key;
      drawTable(noteOf);
    });
    th.append(b);
    return th;
  }));
  const body = rows.map((s) => el("tr", {},
    el("th", { scope: "row" }, s.name, noteOf[s.id] ? el("sup", {}, noteOf[s.id]) : null,
      el("span", { class: "by" }, s.broadcaster)),
    ...cols.map((c) => el("td", { class: [c.key === sortKey && "on", c.de && "de"].filter(Boolean).join(" ") },
      s[c.key] == null ? "–" : c.f(s[c.key])))));
  $("compare").replaceChildren(el("thead", {}, head), el("tbody", {}, ...body));
}

// --- German over time: one chart, every station a line labelled at its end ----
let trendIds = [], trendW = 0;
const measure = (() => {
  const c = document.createElement("canvas").getContext("2d");
  return (text, font) => { c.font = font; return c.measureText(text).width; };
})();

function trend(d) {
  const t = d.german_trend;
  trendIds = d.stations.map((s) => s.id).filter((id) => (t.stations[id] || []).some((v) => v != null));
  if (!trendIds.length) { $("s-trend").remove(); return; }
  $("trend-intro").textContent = `Anteil deutschsprachiger Songs, gleitender ${t.days}-Tage-Schnitt.`;
  drawTrend();
  let raf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if ($("trend").clientWidth !== trendW) drawTrend(); });
  });
}

function drawTrend() {
  const t = D.german_trend, ids = trendIds, box = $("trend");
  if (box.clientWidth < 120) return; // not laid out (hidden tab, zero-width window)
  const W = (trendW = box.clientWidth) - 8, narrow = W < 560, H = narrow ? 260 : 340;
  const n = t.buckets.length;
  const last = Object.fromEntries(ids.map((id) => [id, t.stations[id].findLastIndex((v) => v != null)]));
  const font = `13px ${getComputedStyle(document.body).fontFamily}`;
  const val = (id) => pct(t.stations[id][last[id]]);
  // phones: labels go into a list under the chart, so the lines get the full width
  const labW = narrow ? 0 : Math.max(...ids.map((id) => measure(`${NAME[id]}  ${val(id)}`, font)));
  const P = { l: 48, r: narrow ? 12 : Math.ceil(labW) + 24, t: 8, b: 32 };
  const all = ids.flatMap((id) => t.stations[id]).filter((v) => v != null);
  const yMax = Math.max(0.05, Math.ceil((Math.max(...all) + 0.01) / 0.05) * 0.05);
  const x = (i) => P.l + (i / Math.max(n - 1, 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - v / yMax) * (H - P.t - P.b);
  const g = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": `Anteil deutschsprachiger Songs im Verlauf, ${ids.map((id) => `${NAME[id]} zuletzt ${val(id)}`).join(", ")}` });
  for (let v = 0; v <= yMax + 1e-9; v += 0.05) {
    g.append(svg("line", { x1: P.l, x2: W - P.r + 8, y1: y(v), y2: y(v), class: v ? "grid" : "axis" }));
    const lab = svg("text", { x: P.l - 10, y: y(v) + 4, "text-anchor": "end" });
    lab.textContent = `${Math.round(v * 100)} %`;
    g.append(lab);
  }
  const ticks = narrow ? [0, n - 1] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  for (const i of ticks) {
    const lab = svg("text", { x: x(i), y: H - 10, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
    lab.textContent = short(t.buckets[i]);
    g.append(lab);
  }
  const rule = svg("line", { y1: P.t, y2: H - P.b, class: "rule", visibility: "hidden" });
  g.append(rule);
  const parts = {};
  const lines = svg("g"), marks = svg("g");
  for (const id of ids) {
    let p = "", pen = false;
    t.stations[id].forEach((v, i) => {
      if (v == null) { pen = false; return; }
      p += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    parts[id] = [svg("path", { d: p, class: "tl" }),
      svg("circle", { cx: x(last[id]), cy: y(t.stations[id][last[id]]), r: 3.5, class: "tl-dot" })];
    lines.append(parts[id][0]);
    marks.append(parts[id][1]);
  }
  // labels at the right edge, pushed apart where lines end close together
  const ROW = 18, top = P.t + 6, bottom = H - P.b;
  const labs = ids.map((id) => ({ id, want: y(t.stations[id][last[id]]) })).sort((a, b) => a.want - b.want);
  labs.forEach((l, i) => { l.y = Math.max(l.want, i ? labs[i - 1].y + ROW : top); });
  for (let i = labs.length - 1; i >= 0; i--) {
    labs[i].y = Math.min(labs[i].y, i < labs.length - 1 ? labs[i + 1].y - ROW : bottom);
  }
  const lx = W - P.r + 16;
  for (const l of narrow ? [] : labs) {
    const lead = svg("path", { d: `M${x(last[l.id]) + 6},${l.want}L${lx - 8},${l.want}L${lx - 4},${l.y}`, class: "tl-lead", fill: "none" });
    const text = svg("text", { x: lx, y: l.y + 4, class: "tl-label" });
    const name = svg("tspan");
    name.textContent = NAME[l.id];
    text.append(name);
    const v = svg("tspan", { class: "v", dx: 8 });
    v.textContent = val(l.id);
    text.append(v);
    parts[l.id].push(lead, text);
    marks.append(lead, text);
  }
  g.append(lines, marks);
  const tip = el("div", { class: "tip", hidden: "" });
  let hi = null;
  const highlight = (id) => {
    if (id === hi) return;
    if (hi) for (const e of parts[hi]) e.classList.remove("hi");
    hi = id;
    g.classList.toggle("has-hi", !!id);
    if (id) {
      for (const e of parts[id]) e.classList.add("hi");
      lines.append(parts[id][0]); // to the front
    }
  };
  g.addEventListener("pointermove", (e) => {
    const r = g.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (!narrow && px > W - P.r + 8) { // over the labels
      rule.setAttribute("visibility", "hidden");
      tip.hidden = true;
      const near = labs.reduce((a, b) => (Math.abs(b.y - py) < Math.abs(a.y - py) ? b : a));
      highlight(Math.abs(near.y - py) < ROW ? near.id : null);
      return;
    }
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1))));
    const rows = ids.map((id) => [id, t.stations[id][i]]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
    if (!rows.length) { highlight(null); tip.hidden = true; return; }
    const nearest = rows.reduce((a, b) => (Math.abs(y(b[1]) - py) < Math.abs(y(a[1]) - py) ? b : a))[0];
    highlight(nearest);
    rule.setAttribute("x1", x(i));
    rule.setAttribute("x2", x(i));
    rule.setAttribute("visibility", "visible");
    tip.replaceChildren(el("b", {}, date(t.buckets[i], { weekday: "short", day: "numeric", month: "short" })),
      ...rows.map(([id, v]) => el("div", { class: id === nearest ? "hi" : "" }, NAME[id], el("span", {}, pct(v)))));
    tip.hidden = false;
    const left = x(i);
    tip.style.left = `${left > W / 2 ? left - tip.offsetWidth - 16 : left + 16}px`;
  });
  g.addEventListener("pointerleave", () => { highlight(null); rule.setAttribute("visibility", "hidden"); tip.hidden = true; });
  const legend = narrow ? el("div", { class: "tl-legend" }, ...labs.map((l) => {
    const b = el("button", { type: "button" }, el("b", {}, NAME[l.id]), el("span", {}, val(l.id)));
    parts[l.id].push(b);
    b.addEventListener("click", () => highlight(hi === l.id ? null : l.id));
    return b;
  })) : null;
  box.replaceChildren(g, tip, legend);
}

// --- language / origin: German, the two biggest others, the rest ---------------
function mix(which) {
  for (const b of $("mix-tabs").querySelectorAll("button")) b.setAttribute("aria-selected", b.dataset.mix === which);
  const m = D[which];
  const german = which === "languages" ? "de" : "DE";
  const label = (k) => (k === "other" ? "andere" : which === "languages" ? language(k) : country(k));
  const counts = Object.fromEntries(D.stations.map((s) => {
    const c = { ...(m.stations[s.id] || { counts: {} }).counts };
    delete c.zxx; // instrumental: no language
    return [s.id, c];
  }));
  const sum = (c) => Object.values(c).reduce((a, b) => a + b, 0);
  const overall = {};
  for (const c of Object.values(counts)) {
    const t = sum(c);
    if (t) for (const [k, v] of Object.entries(c)) overall[k] = (overall[k] || 0) + v / t;
  }
  const others = Object.keys(overall).filter((k) => k !== german && k !== "other")
    .sort((a, b) => overall[b] - overall[a]).slice(0, 2);
  const cats = [german, ...others, "other"];
  $("mix-intro").textContent = which === "languages"
    ? "In welcher Sprache gesungen wird. Anteil an allen Songs mit bekannter Sprache, ohne Instrumentals."
    : "Woher die Künstler:innen kommen, bei mehreren die zuerst genannten. Anteil an allen Songs mit bekannter Herkunft.";
  $("mix-legend").replaceChildren(...cats.map((k, i) => el("span", {}, el("i", { class: `c${i}` }), label(k))));
  $("mix").replaceChildren(...D.stations.map((s) => {
    const c = counts[s.id], total = sum(c);
    const shares = cats.map((k) => (total ? (c[k] || 0) / total : 0));
    shares[3] = total ? 1 - shares[0] - shares[1] - shares[2] : 0;
    const segs = shares.map((v, i) => v < 0.0005 ? null : el("span", {
      class: `c${i}`, style: `flex:0 1 ${v * 100}%`, title: `${s.name}: ${label(cats[i])} ${pct(v)}` },
      i > 0 && v >= 0.15 ? pct(v) : ""));
    return el("div", { class: "stack-row" },
      el("span", { class: "name" }, s.name),
      el("div", { class: "stack", role: "img",
        "aria-label": `${s.name}: ${cats.map((k, i) => `${label(k)} ${pct(shares[i])}`).join(", ")}` }, ...segs),
      el("span", { class: "de", title: `${label(german)}` }, total ? pct(shares[0]) : "–"));
  }));
}

// --- hours: each row scaled to the station's own busiest hour ------------------
function hours(d) {
  const head = el("tr", {}, el("th"), ...Array.from({ length: 24 }, (_, h) =>
    el("th", { scope: "col" }, h % 3 === 0 ? String(h) : "")));
  const body = d.stations.map((s) => {
    const gaps = new Set(s.no_playlist_hours);
    const max = Math.max(...s.per_hour.filter((v, h) => v != null && !gaps.has(h)), 1);
    return el("tr", {}, el("th", { scope: "row" }, s.name),
      ...s.per_hour.map((v, h) => gaps.has(h)
        ? el("td", { class: "gap", title: `${s.name}, ${h}–${(h + 1) % 24} Uhr: keine Playlist` })
        : el("td", { style: `background:${shade(0.06 + 0.9 * Math.max(0, ((v || 0) / max - 0.3) / 0.7))}`,
          title: `${s.name}, ${h}–${(h + 1) % 24} Uhr: ${fmt1.format(v || 0)} Songs` })));
  });
  $("hours").replaceChildren(el("thead", {}, head), el("tbody", {}, ...body));
  if (!d.stations.some((s) => s.no_playlist_hours.length)) $("hours-key").remove();
}

// --- most played ----------------------------------------------------------------
let topWhich = "songs", topAll = false;

function topList(which) {
  if (which !== topWhich) topAll = false;
  topWhich = which;
  for (const b of $("top-tabs").querySelectorAll("button")) b.setAttribute("aria-selected", b.dataset.top === which);
  $("top-col").textContent = which === "songs" ? "Song" : "Künstler:in";
  const all = which === "songs" ? D.top_songs : D.top_artists;
  const rows = topAll ? all : all.slice(0, TOP_SHOWN);
  const totals = all.map((r) => Object.values(r.per_week).reduce((a, b) => a + b, 0));
  const max = Math.max(...totals, 1);
  const n = D.stations.length;
  $("top").replaceChildren(...rows.map((r, i) => {
    const reach = `bei ${r.stations} von ${n} Sendern`;
    const what = which === "songs"
      ? el("div", { class: "what" }, el("b", {}, r.title), el("span", {}, `${r.artist} `, el("small", {}, `· ${reach}`)))
      : el("div", { class: "what" }, el("b", {}, r.artist),
        el("span", {}, r.country ? country(r.country) : "Herkunft unbekannt", " ", el("small", {}, `· ${reach}`)));
    const detail = D.stations.filter((s) => r.per_week[s.id])
      .map((s) => `${s.name}: ${fmt1.format(r.per_week[s.id])}×`).join("\n");
    return el("li", { title: detail }, what,
      el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(totals[i] / max) * 100}%` })),
      el("span", { class: "n" }, fmt.format(Math.round(totals[i]))));
  }));
  const more = $("top-more");
  more.hidden = all.length <= TOP_SHOWN;
  more.textContent = topAll ? `Nur die ersten ${TOP_SHOWN}` : `Alle ${all.length} zeigen`;
}

function numberOnes(d) {
  const rows = d.stations.filter((s) => s.top_song);
  if (!rows.length) { $("ones-head").remove(); $("ones").remove(); return; }
  $("ones").replaceChildren(...rows.map((s) => el("li", {},
    el("span", { class: "st" }, s.name),
    el("span", { class: "what" }, s.top_song.title, el("span", { class: "muted" }, ` · ${s.top_song.artist}`)),
    el("span", { class: "n" }, fmt.format(Math.round(s.top_song.per_week))))));
}

// --- overlap matrix ---------------------------------------------------------------
function overlap(d) {
  const ids = d.stations.map((s) => s.id);
  const head = el("tr", {}, el("th"), ...ids.map((id) => el("th", { scope: "col" }, NAME[id])));
  const body = ids.map((a) => el("tr", {}, el("th", { scope: "row" }, NAME[a]),
    ...ids.map((b) => {
      if (a === b) return el("td", { class: "self" });
      const v = (d.overlap[a] || {})[b];
      if (v == null) return el("td", { class: "none" }, "–");
      return el("td", { style: `background:${shade(0.06 + v * 0.94)};color:var(${v > 0.45 ? "--on-data" : "--ink"})`,
        title: `${pct(v)} der Songs von ${NAME[a]} laufen auch bei ${NAME[b]}` }, pct(v));
    })));
  $("overlap").replaceChildren(el("thead", {}, head), el("tbody", {}, ...body));
}

function quality(d) {
  const items = [];
  const gaps = d.stations.filter((s) => s.no_playlist_hours.length);
  if (gaps.length) {
    items.push(["Stunden ohne Playlist",
      gaps.map((s) => `${s.name} veröffentlicht für ${hourRanges(s.no_playlist_hours)} keine oder kaum Titel`).join("; ") +
      ". Diese Stunden fehlen in allen Zahlen, auch wenn dort Musik läuft. Songs pro Tag sind dadurch zu niedrig, " +
      "Anteile beschreiben nur den Rest des Tages."]);
  }
  const partial = d.stations.filter((s) => s.coverage < 0.8);
  if (partial.length) {
    items.push(["Kürzere Zeiträume",
      partial.map((s) => `${s.name}: ${Math.round(s.coverage * d.days)} von ${d.days} Tagen`).join(", ") +
      ". Manche Sender stellen ihre Playlist nur für wenige Tage online, oder sie wird erst seit Kurzem mitgeschnitten. " +
      "Mengen sind deshalb pro erfasstem Tag gerechnet."]);
  }
  const known = d.stations.filter((s) => s.language_known != null).sort((a, b) => a.language_known - b.language_known);
  if (known.length) {
    const lo = known[0], hi = known[known.length - 1];
    items.push(["Automatische Zuordnung",
      `Sprache und Herkunft stammen aus offenen Datenbanken und werden automatisch zugeordnet. Die Sprache ist für ` +
      `${pct(lo.language_known)} (${lo.name}) bis ${pct(hi.language_known)} (${hi.name}) der Songs bekannt. ` +
      "Unbekannte Songs fehlen in den Anteilen, Fehlzuordnungen sind möglich."]);
  }
  items.push(["Nur Musik", "Jingles, Nachrichten und Sendungen werden herausgefiltert, so gut es die Playlists erlauben."]);
  $("quality").replaceChildren(...items.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
}

for (const b of $("top-tabs").querySelectorAll("button")) b.addEventListener("click", () => topList(b.dataset.top));
for (const b of $("mix-tabs").querySelectorAll("button")) b.addEventListener("click", () => mix(b.dataset.mix));
// light / dark, remembered per browser
const darkNow = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
function syncTheme() {
  const label = darkNow() ? "Helles Design" : "Dunkles Design";
  $("theme").setAttribute("aria-label", label);
  $("theme").title = label;
}
$("theme").addEventListener("click", () => {
  const next = darkNow() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch {}
  syncTheme();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncTheme);
syncTheme();
$("top-more").addEventListener("click", () => { topAll = !topAll; topList(topWhich); });

fetch("data.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(render)
  .catch((e) => {
    console.error(e);
    $("loading").textContent = "Die Daten konnten gerade nicht geladen werden. Bitte später noch einmal versuchen.";
  });
