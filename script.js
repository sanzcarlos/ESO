"use strict";

// Polyfill de Popover (copia local, sin red) solo si el navegador no lo soporta.
// Se carga con <script> clásico en lugar de import() para que funcione con file://.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  const polyfill = document.createElement("script");
  polyfill.src = "vendor/popover-polyfill.min.js";
  polyfill.async = false;
  document.head.append(polyfill);
}

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Navegación adaptable ----------
   Se colapsa en popover solo cuando la fila completa no cabe (sin breakpoint fijo). */
const header = document.querySelector(".site-header");
const inner = header.querySelector(".header-inner");
const menu = document.getElementById("site-menu");

let lastWidth = 0;
let collapsed = true;

function layout(force = false) {
  const width = header.clientWidth;
  // Colapsado: re-medir solo si la cabecera ha crecido
  if (collapsed && !force && width <= lastWidth) {
    lastWidth = width;
    return;
  }
  lastWidth = width;

  const wasOpen = menu.matches(":popover-open, .\\:popover-open");

  header.classList.add("is-measuring", "is-wide");
  menu.removeAttribute("popover");
  const fits = inner.scrollWidth <= inner.clientWidth;
  requestAnimationFrame(() => header.classList.remove("is-measuring"));

  header.classList.toggle("is-wide", fits);
  collapsed = !fits;

  if (fits) {
    menu.removeAttribute("popover");
  } else {
    menu.setAttribute("popover", "auto");
    if (wasOpen) menu.showPopover();
  }
}

layout(true);
const ro = new ResizeObserver(() => layout());
ro.observe(header);
ro.observe(menu);
document.fonts?.ready.then(() => layout(true));

// Cerrar el menú colapsado al elegir un enlace
menu.addEventListener("click", (e) => {
  if (e.target.closest("a") && menu.hasAttribute("popover")) menu.hidePopover();
});

/* ---------- Enlace activo según sección visible ---------- */
const links = [...menu.querySelectorAll('a[href^="#"]')];
const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);

const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links) {
        if (a.getAttribute("href") === `#${entry.target.id}`) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    }
  },
  { rootMargin: "-40% 0px -55% 0px" }
);
sections.forEach((s) => spy.observe(s));

/* ---------- Fallback del revelado al hacer scroll ---------- */
if (
  !CSS.supports("(animation-timeline: view()) and (animation-range: entry)") &&
  matchMedia("(prefers-reduced-motion: no-preference)").matches
) {
  const items = document.querySelectorAll(".reveal");
  const update = (el, ratio) => {
    el.style.opacity = ratio;
    el.style.translate = `0 ${(1 - ratio) * 2}rem`;
  };
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => update(e.target, e.intersectionRatio)),
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
  );
  items.forEach((el) => {
    update(el, 0);
    io.observe(el);
  });
}
