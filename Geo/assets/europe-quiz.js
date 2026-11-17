"use strict";

/* Quiz del mapa de Europa (v5)
   - Funciona con file:// (sin fetch ni módulos): los datos se cargan con un <script> clásico.
   - Teclado, lector de pantalla y táctil. Temporizador basado en la hora real (no se desfasa). */

const DATA = window.EU_QUIZ_DATA;
const NS = "http://www.w3.org/2000/svg";
const MW = DATA.w;
const MH = DATA.h;
const TIME = 15 * 60;                                // segundos
const N_Q = Math.round(DATA.f.length / 4);           // una cuarta parte de los lugares = 14
const MAX_ZOOM = 8;

const CATS = {
  W: { icon: "🌊", label: "Océanos y mares" },
  R: { icon: "💧", label: "Lagos y ríos" },
  M: { icon: "⛰️", label: "Relieve" },
  C: { icon: "🧭", label: "Costas" },
  I: { icon: "🏝️", label: "Islas" },
};
// Colores de las marcas sobre el mapa (fondo ilustrado: se mantienen fijos, con trazo blanco)
const MARK_COL = { W: "#1f5fa8", R: "#0a7896", M: "#8b4a16", C: "#7a3f9e", I: "#2e7d32" };
const OK_COL = "#2e7d32";
const KO_COL = "#c62828";
const FONT = "system-ui, Segoe UI, sans-serif";

const $ = (id) => document.getElementById(id);
const svg = $("map");
const viewport = $("viewport");

// Mapa base vectorial (costas, ríos, lagos, fronteras): se inserta en el propio SVG para que los trazos
// mantengan su grosor en píxeles de pantalla a cualquier zoom (vector-effect: non-scaling-stroke)
$("basemap").innerHTML = window.EU_MAP_MARKUP;

/* ---------- Utilidades ---------- */

// Almacenamiento seguro: si localStorage está bloqueado, se usa memoria
const store = (() => {
  const mem = {};
  let ls = null;
  try {
    ls = window.localStorage;
    ls.setItem("__t", "1");
    ls.removeItem("__t");
  } catch { ls = null; }
  return {
    get: (k) => { try { return ls ? ls.getItem(k) : (mem[k] ?? null); } catch { return mem[k] ?? null; } },
    set: (k, v) => { mem[k] = String(v); try { ls?.setItem(k, v); } catch { /* sin espacio o bloqueado */ } },
  };
})();

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
}

function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "dataset") Object.assign(e.dataset, v);
    else if (k in e && k !== "list") e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

const fmtTime = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
const fmtKm = (km) => Math.round(km).toLocaleString("es-ES");

let announceTimer = 0;
function announce(msg) {
  const a = $("announcer");
  a.textContent = "";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { a.textContent = msg; }, 60);
}

/* ---------- Estado ---------- */

const state = {
  qs: [],
  cur: 0,
  answers: new Map(),   // id -> {x, y}
  results: null,        // Map id -> {ok, d, nx, ny}
  running: false,
  deadline: 0,
  timerId: 0,
  warned: false,
  hl: null,
};

/* ---------- Selección de lugares ---------- */
// Distinta cada vez: evita el conjunto anterior y prioriza los menos preguntados
function choose() {
  let hist = {};
  let lastArr = [];
  try { hist = JSON.parse(store.get("euQuizHist") || "{}"); } catch { /* datos corruptos */ }
  try { lastArr = JSON.parse(store.get("euQuizLast") || "[]"); } catch { /* datos corruptos */ }
  const last = new Set(lastArr);
  const pool = DATA.f.map((f) => ({ f, w: (hist[f.id] || 0) + (last.has(f.id) ? 1e6 : 0) + Math.random() * 3 }));
  pool.sort((a, b) => a.w - b.w);
  const pick = pool.slice(0, N_Q).map((p) => p.f);
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }
  pick.forEach((f) => { hist[f.id] = (hist[f.id] || 0) + 1; });
  store.set("euQuizHist", JSON.stringify(hist));
  store.set("euQuizLast", JSON.stringify(pick.map((f) => f.id)));
  return pick;
}

/* ---------- Ciclo de vida ---------- */

function start() {
  state.qs = choose();
  state.answers.clear();
  state.results = null;
  state.cur = 0;
  state.hl = null;
  state.running = true;
  state.warned = false;
  state.deadline = Date.now() + TIME * 1000;

  $("answers").replaceChildren();
  $("marks").replaceChildren();
  $("result").hidden = true;
  $("intro").hidden = true;
  $("map-ui").inert = false;
  document.querySelector(".map-frame").classList.remove("locked");
  $("btnEnd").disabled = false;
  $("btnStart").disabled = true;

  buildList();
  updateList();
  updateCurrent();
  tick();
  clearInterval(state.timerId);
  state.timerId = setInterval(tick, 250);

  // El botón pulsado desaparece/se desactiva: llevamos el foco al primer lugar
  document.querySelector("#qs .q")?.focus();
  announce(`Ejercicio iniciado. ${state.qs.length} lugares y ${TIME / 60} minutos. Primero: ${state.qs[0].name}.`);
}

function remaining() {
  return Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
}

function tick() {
  const left = remaining();
  const t = $("timer");
  t.textContent = fmtTime(left);
  t.classList.toggle("warn", left <= 60);
  if (left <= 60 && left > 0 && !state.warned) {
    state.warned = true;
    announce("Queda un minuto.");
  }
  if (left <= 0) finish(true);
}

function finish(timeout) {
  if (!state.running) return;
  state.running = false;
  clearInterval(state.timerId);
  const dlg = $("confirm");
  if (dlg.open) dlg.close();

  document.querySelector(".map-frame").classList.add("locked");
  $("btnEnd").disabled = true;
  $("btnStart").disabled = false;

  const results = new Map();
  let ok = 0;
  for (const f of state.qs) {
    const a = state.answers.get(f.id);
    let r = { ok: false, d: null };
    if (a) {
      const [d, nx, ny] = nearest(a, f.pts);
      r = { ok: d <= f.tol, d: d * DATA.kmPerPx, nx, ny };
    }
    if (r.ok) ok++;
    results.set(f.id, r);
  }
  state.results = results;

  drawAnswers();
  drawMarks();
  updateList();
  updateCurrent();

  const pct = Math.round((ok / state.qs.length) * 100);
  const text = `${timeout ? "⏰ ¡Se acabó el tiempo! " : ""}Puntuación: ${ok} / ${state.qs.length} (${pct} % de aciertos)`;
  $("score").textContent = text;
  $("result").hidden = false;
  announce(text.replace("⏰ ", ""));
  if (!timeout) $("result").focus();
}

/* ---------- Lista de lugares ---------- */

function buildList() {
  $("qs").replaceChildren(...state.qs.map((f, i) => h("li", {},
    h("button", { type: "button", className: "q", dataset: { cat: f.cat, i } },
      h("span", { className: "num", textContent: String(i + 1) }),
      h("span", { className: "cat", textContent: CATS[f.cat].icon, "aria-hidden": "true" }),
      h("span", { className: "nm", textContent: f.name }),
      // Icono decorativo (oculto a lectores) + texto del estado (visible y legible)
      h("span", { className: "st" }, h("span", { className: "g", "aria-hidden": "true" }), h("span", { className: "t" })),
    ),
  )));
}

function updateList() {
  document.querySelectorAll("#qs .q").forEach((b, i) => {
    const f = state.qs[i];
    const r = state.results?.get(f.id);
    const glyph = b.querySelector(".st .g");
    const text = b.querySelector(".st .t");
    b.removeAttribute("aria-current");
    b.removeAttribute("data-state");

    if (r) {
      b.dataset.state = r.ok ? "right" : "wrong";
      glyph.textContent = r.ok ? "✔" : "✘";
      text.textContent = r.ok ? " Correcto" : r.d == null ? " Sin respuesta" : ` a ${fmtKm(r.d)} km`;
      b.setAttribute("aria-pressed", String(state.hl === f.id));
    } else {
      b.removeAttribute("aria-pressed");
      const placed = state.answers.has(f.id);
      glyph.textContent = placed ? "📍" : "";
      text.textContent = placed ? " Colocado" : "";
      if (state.running && i === state.cur) b.setAttribute("aria-current", "true");
    }
  });
}

function updateCurrent() {
  const c = $("current");
  if (state.running) {
    c.replaceChildren("Sitúa en el mapa: ", h("strong", { textContent: `${state.cur + 1}. ${state.qs[state.cur].name}` }));
  } else if (state.results) {
    c.textContent = "Pulsa un lugar de la lista para resaltarlo en el mapa.";
  }
}

$("qs").addEventListener("click", (e) => {
  const b = e.target.closest("button.q");
  if (!b) return;
  const i = Number(b.dataset.i);
  if (state.running) {
    state.cur = i;
    updateList();
    updateCurrent();
  } else if (state.results) {
    highlight(state.qs[i].id);
  }
});

/* ---------- Zoom y desplazamiento ---------- */

let TS = 1;                                  // factor de tamaño de etiquetas (A− / A+)
let vb = { x: 0, y: 0, w: MW, h: MH };
const zoom = () => MW / vb.w;
const upx = () => vb.w / (svg.getBoundingClientRect().width || 1000);   // unidades de mapa por píxel

function clampVB() {
  vb.x = Math.max(0, Math.min(MW - vb.w, vb.x));
  vb.y = Math.max(0, Math.min(MH - vb.h, vb.y));
}

function applyVB() {
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  $("zlevel").textContent = Math.round(zoom() * 10) / 10 + "×";
  // Sin zoom se puede desplazar la página con el dedo; con zoom, el mapa se arrastra
  viewport.style.touchAction = zoom() > 1.001 ? "none" : "pan-y";
  redraw();
}

function redraw() {
  drawMarks();
  if (state.results) drawAnswers();
  drawCursor();
}

function zoomAt(px, py, f) {
  const nw = Math.min(MW, Math.max(MW / MAX_ZOOM, vb.w / f));
  const r = nw / vb.w;
  vb.x = px - (px - vb.x) * r;
  vb.y = py - (py - vb.y) * r;
  vb.w = nw;
  vb.h *= r;
  clampVB();
  applyVB();
}

const center = () => ({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });

function svgPoint(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

$("zin").addEventListener("click", () => { const c = center(); zoomAt(c.x, c.y, 1.5); });
$("zout").addEventListener("click", () => { const c = center(); zoomAt(c.x, c.y, 1 / 1.5); });
$("zreset").addEventListener("click", resetView);
$("tin").addEventListener("click", () => { TS = Math.min(2.2, TS * 1.2); redraw(); });
$("tout").addEventListener("click", () => { TS = Math.max(0.6, TS / 1.2); redraw(); });
new ResizeObserver(redraw).observe(svg);

function resetView() {
  vb = { x: 0, y: 0, w: MW, h: MH };
  applyVB();
}

viewport.addEventListener("wheel", (e) => {
  // Sin zoom, la rueda hacia abajo sigue desplazando la página
  if (e.deltaY > 0 && zoom() <= 1.001) return;
  e.preventDefault();
  const p = svgPoint(e);
  zoomAt(p.x, p.y, e.deltaY < 0 ? 1.25 : 0.8);
}, { passive: false });

const ptrs = new Map();
let drag = null;
let pinch = null;

viewport.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  try { viewport.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    drag = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, moved: false };
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    if (drag) drag.moved = true;
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const m = svgPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
    if (pinch.d > 0) zoomAt(m.x, m.y, d / pinch.d);
    pinch.d = d;
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      viewport.classList.add("grab");
    }
    if (drag.moved && zoom() > 1.001) {
      const k = vb.w / svg.getBoundingClientRect().width;
      vb.x = drag.vx - dx * k;
      vb.y = drag.vy - dy * k;
      clampVB();
      svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    }
  }
});

function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) {
    viewport.classList.remove("grab");
    const d = drag;
    drag = null;
    if (d && !d.moved && e.type === "pointerup") {
      const p = svgPoint(e);
      place(p.x, p.y);
    }
  }
}
viewport.addEventListener("pointerup", endPtr);
viewport.addEventListener("pointercancel", endPtr);

/* ---------- Teclado: cursor virtual sobre el mapa ---------- */

const kc = { x: MW / 2, y: MH / 2, visible: false };

function moveCursor(dx, dy) {
  kc.x = Math.max(0, Math.min(MW, kc.x + dx));
  kc.y = Math.max(0, Math.min(MH, kc.y + dy));
  // Mantener el cursor dentro de la vista
  const m = Math.min(vb.w, vb.h) * 0.08;
  if (kc.x < vb.x + m) vb.x = kc.x - m;
  if (kc.x > vb.x + vb.w - m) vb.x = kc.x - vb.w + m;
  if (kc.y < vb.y + m) vb.y = kc.y - m;
  if (kc.y > vb.y + vb.h - m) vb.y = kc.y - vb.h + m;
  clampVB();
  applyVB();
}

function showCursor() {
  kc.visible = true;
  // Si el cursor quedó fuera de la vista, se recoloca en el centro
  if (kc.x < vb.x || kc.x > vb.x + vb.w || kc.y < vb.y || kc.y > vb.y + vb.h) Object.assign(kc, center());
  drawCursor();
}

viewport.addEventListener("focus", () => { if (viewport.matches(":focus-visible")) showCursor(); });
viewport.addEventListener("blur", () => { kc.visible = false; drawCursor(); });

viewport.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  // Con el ratón el cursor está oculto: aparece en cuanto se usa el teclado
  if (!kc.visible && /^(Arrow|Enter$|\+$|-$|=$| $)/.test(e.key)) showCursor();
  const step = vb.w * 0.03 * (e.shiftKey ? 4 : 1);
  switch (e.key) {
    case "ArrowLeft": moveCursor(-step, 0); break;
    case "ArrowRight": moveCursor(step, 0); break;
    case "ArrowUp": moveCursor(0, -step); break;
    case "ArrowDown": moveCursor(0, step); break;
    case "Enter": place(kc.x, kc.y); break;
    case " ": break;                                  // se ejecuta al soltar (keyup), como un botón nativo
    case "+": case "=": zoomAt(kc.x, kc.y, 1.5); break;
    case "-": case "_": zoomAt(kc.x, kc.y, 1 / 1.5); break;
    case "0": resetView(); break;
    default: return;
  }
  e.preventDefault();
});
viewport.addEventListener("keyup", (e) => {
  if (e.key === " ") { e.preventDefault(); place(kc.x, kc.y); }
});

function drawCursor() {
  const g = $("kcursor");
  g.replaceChildren();
  if (!kc.visible) return;
  const T = upx() * TS;
  const r = 9 * T;
  const L = 26 * T;
  for (const [stroke, w] of [["#fff", 6 * T], ["#111", 2.5 * T]]) {
    svgEl("circle", { cx: kc.x, cy: kc.y, r, fill: "none", stroke, "stroke-width": w }, g);
    svgEl("path", { d: `M${kc.x - L},${kc.y}H${kc.x - r}M${kc.x + r},${kc.y}H${kc.x + L}M${kc.x},${kc.y - L}V${kc.y - r}M${kc.x},${kc.y + r}V${kc.y + L}`, stroke, "stroke-width": w, "stroke-linecap": "round" }, g);
  }
}

/* ---------- Colocar marcas ---------- */

function place(x, y) {
  if (!state.running) return;
  const f = state.qs[state.cur];
  state.answers.set(f.id, { x, y });
  drawMarks();

  // Pasar al siguiente lugar sin respuesta
  let next = null;
  for (let k = 1; k <= state.qs.length; k++) {
    const j = (state.cur + k) % state.qs.length;
    if (!state.answers.has(state.qs[j].id)) { state.cur = j; next = state.qs[j]; break; }
  }
  updateList();
  updateCurrent();
  announce(next ? `${f.name} colocado. Ahora: ${next.name}.` : `${f.name} colocado. Has respondido todos los lugares.`);
}

function drawMarks() {
  const g = $("marks");
  g.replaceChildren();
  if (!state.qs.length) return;
  const T = upx() * TS;
  state.qs.forEach((f, i) => {
    const a = state.answers.get(f.id);
    if (!a) return;
    const r = state.results?.get(f.id);
    const fill = r ? (r.ok ? OK_COL : KO_COL) : MARK_COL[f.cat];
    const gg = svgEl("g", { "data-id": f.id }, g);
    svgEl("circle", { cx: a.x, cy: a.y, r: 13 * T, fill, stroke: "#fff", "stroke-width": 2.5 * T }, gg);
    svgEl("text", { x: a.x, y: a.y + 5 * T, "text-anchor": "middle", "font-size": 14 * T, "font-weight": "bold", fill: "#fff", "font-family": FONT }, gg).textContent = i + 1;
    if (r) {
      // El resultado no depende solo del color: ✔ / ✘
      svgEl("circle", { cx: a.x + 13 * T, cy: a.y - 13 * T, r: 8 * T, fill: "#fff", stroke: fill, "stroke-width": 2 * T }, gg);
      svgEl("text", { x: a.x + 13 * T, y: a.y - 13 * T + 4.5 * T, "text-anchor": "middle", "font-size": 12 * T, "font-weight": "bold", fill, "font-family": FONT }, gg).textContent = r.ok ? "✔" : "✘";
    }
  });
  if (state.hl !== null) applyHighlight();
}

/* ---------- Corrección ---------- */

// Distancia de un punto a un segmento (en píxeles del mapa)
function distSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return [Math.hypot(p.x - x, p.y - y), x, y];
}

function nearest(p, pts) {
  if (pts.length === 1) return [Math.hypot(p.x - pts[0][0], p.y - pts[0][1]), pts[0][0], pts[0][1]];
  let best = [Infinity];
  for (let i = 0; i < pts.length - 1; i++) {
    const r = distSeg(p, pts[i], pts[i + 1]);
    if (r[0] < best[0]) best = r;
  }
  return best;
}

function drawAnswers() {
  const S = upx();
  const T = S * TS;
  const ga = $("answers");
  ga.replaceChildren();
  state.qs.forEach((f, i) => {
    const a = state.answers.get(f.id);
    const r = state.results.get(f.id);
    const g = svgEl("g", { "data-id": f.id, class: "ans" }, ga);
    const col = r.ok ? OK_COL : KO_COL;

    if (f.pts.length > 1) {
      const d = "M" + f.pts.map((p) => p.join(",")).join(" L");
      svgEl("path", { d, fill: "none", stroke: "#000", "stroke-width": 8 * S, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.55 }, g);
      svgEl("path", { d, fill: "none", stroke: "#ffeb3b", "stroke-width": 4.5 * S, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    } else {
      svgEl("circle", { cx: f.pts[0][0], cy: f.pts[0][1], r: f.tol, fill: "rgba(255,235,59,.18)", stroke: "#000", "stroke-width": 1.6 * S, "stroke-dasharray": `${6 * S} ${4 * S}` }, g);
      svgEl("circle", { cx: f.pts[0][0], cy: f.pts[0][1], r: 6 * S, fill: "#ffeb3b", stroke: "#000", "stroke-width": 2 * S }, g);
    }
    if (a && !r.ok) {
      svgEl("line", { x1: a.x, y1: a.y, x2: r.nx, y2: r.ny, stroke: col, "stroke-width": 2.5 * S, "stroke-dasharray": `${7 * S} ${5 * S}` }, g);
    }
    const lp = f.pts[Math.floor((f.pts.length - 1) / 2)];
    svgEl("text", { x: lp[0], y: lp[1] - 14 * T, "text-anchor": "middle", "font-size": 16 * T, "font-weight": "bold", fill: "#111", stroke: "#fff", "stroke-width": 4.5 * T, "paint-order": "stroke", "font-family": FONT }, g).textContent = `${i + 1}. ${f.name}`;
  });
  if (state.hl !== null) applyHighlight();
}

function applyHighlight() {
  const hl = state.hl;
  document.querySelectorAll("#answers g.ans").forEach((g) => { g.style.opacity = hl === null || +g.dataset.id === hl ? 1 : 0.15; });
  document.querySelectorAll("#marks g").forEach((g) => { g.style.opacity = hl === null || +g.dataset.id === hl ? 1 : 0.25; });
}

// Pulsar de nuevo el lugar resaltado quita el resaltado
function highlight(id) {
  state.hl = state.hl === id ? null : id;
  applyHighlight();
  updateList();
}

/* ---------- Botones y diálogo ---------- */

$("btnStart").addEventListener("click", start);
$("btnIntro").addEventListener("click", start);

$("btnEnd").addEventListener("click", () => {
  const missing = state.qs.filter((f) => !state.answers.has(f.id)).length;
  if (!missing) { finish(false); return; }
  $("confirm-text").textContent = missing === 1
    ? "Todavía te queda 1 lugar sin respuesta. ¿Quieres terminar de todos modos?"
    : `Todavía te quedan ${missing} lugares sin respuesta. ¿Quieres terminar de todos modos?`;
  $("confirm").showModal();
});

$("confirm").addEventListener("close", (e) => {
  const dlg = e.currentTarget;
  const choice = dlg.returnValue;
  dlg.returnValue = "";                         // evita que un valor antiguo se filtre en el siguiente cierre
  if (choice === "finish") finish(false);
});

// Cerrar al pulsar fuera: solo donde falta `closedby` (Safari)
if (!("closedBy" in HTMLDialogElement.prototype)) {
  const dlg = $("confirm");
  const outside = (e) => {
    const r = dlg.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dlg.addEventListener("pointerdown", (e) => { pressedOutside = outside(e); });
  dlg.addEventListener("pointerup", (e) => { if (pressedOutside && outside(e)) dlg.close(); });
}

/* ---------- Estado inicial ---------- */
document.querySelector(".map-frame").classList.add("locked");
applyVB();
