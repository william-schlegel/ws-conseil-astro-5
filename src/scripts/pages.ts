import type { ChartApi } from "./chart/engine";
import { prefersReducedMotion } from "./motion";

/** Comportements propres à certaines pages (détectés par attributs data-*). */

// ------------------------------------------ filtre des projets par catégorie
function initProjectFilter() {
  const group = document.querySelector<HTMLElement>("[data-filter-group]");
  if (!group) return;
  const buttons = Array.from(
    group.querySelectorAll<HTMLButtonElement>("[data-filter]"),
  );
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-filter-item]"),
  );
  const status = document.querySelector<HTMLElement>("[data-filter-status]");

  const apply = (filter: string) => {
    let shown = 0;
    for (const card of cards) {
      const cats = (card.dataset.cats ?? "").split(" ");
      const visible = filter === "all" || cats.includes(filter);
      card.hidden = !visible;
      if (visible) {
        shown++;
        card.classList.add("is-in");
      }
    }
    for (const b of buttons) {
      b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
    }
    if (status) {
      status.textContent = `${shown} projet${shown > 1 ? "s" : ""}`;
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter ?? "all";
      if (button.getAttribute("aria-pressed") === "true") return;
      if (!document.startViewTransition || prefersReducedMotion()) {
        apply(filter);
        return;
      }
      const root = document.documentElement;
      for (const card of cards) {
        card.style.viewTransitionName = `pcard-${card.dataset.filterItem}`;
      }
      root.classList.add("vt-filter");
      const vt = document.startViewTransition(() => apply(filter));
      vt.finished.finally(() => {
        root.classList.remove("vt-filter");
        for (const card of cards) card.style.viewTransitionName = "";
      });
    });
  }
}

// --------------------------------------------- galaxie des technos (skills)
function initGalaxy() {
  const galaxy = document.querySelector<HTMLElement>("[data-galaxy]");
  if (!galaxy) return;
  const label = galaxy.querySelector<HTMLElement>("[data-galaxy-label]");
  if (!label) return;
  const idle = label.textContent ?? "";
  const items = galaxy.querySelectorAll<HTMLElement>("[data-galaxy-item]");
  const set = (text: string, active: boolean) => {
    label.textContent = text;
    label.toggleAttribute("data-active", active);
  };
  items.forEach((item) => {
    const name = item.dataset.galaxyItem ?? "";
    item.addEventListener("pointerenter", () => set(name, true));
    item.addEventListener("focus", () => set(name, true));
    item.addEventListener("pointerleave", () => set(idle, false));
    item.addEventListener("blur", () => set(idle, false));
  });
}

// ------------------------------------------- contact : chaque frappe émet
function initContact(chart: ChartApi | null) {
  const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
  if (!form) return;

  // La page est pré-rendue : le code d'erreur renvoyé par /api/contact
  // (?erreur=…) est traduit ici quand le serveur n'a pas pu le faire.
  const alert = document.querySelector<HTMLElement>("[data-contact-error]");
  const code = new URLSearchParams(window.location.search).get("erreur");
  if (alert && code && alert.hidden) {
    let messages: Record<string, string> = {};
    try {
      messages = JSON.parse(alert.dataset.messages ?? "{}");
    } catch {
      messages = {};
    }
    alert.textContent = messages[code] ?? "Une erreur est survenue.";
    alert.hidden = false;
  }

  let last = 0;
  form.addEventListener("input", (e) => {
    const field = e.target;
    if (
      !(field instanceof HTMLInputElement) &&
      !(field instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    field.closest(".field")?.toggleAttribute("data-filled", field.value !== "");
    const now = performance.now();
    if (!chart || now - last < 110) return;
    last = now;
    const r = field.getBoundingClientRect();
    const x = r.left + Math.min(r.width - 12, 14 + field.value.length * 7.5);
    chart.ping(x, r.top + Math.min(r.height / 2, 28), 0.22);
  });
  form.addEventListener("submit", () => {
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) {
      button.dataset.sending = "true";
      const text = button.querySelector("[data-label]");
      if (text) text.textContent = "Envoi…";
    }
    const r = form.getBoundingClientRect();
    chart?.ping(r.left + r.width / 2, r.top + r.height / 2, 1);
  });
}

// ------------------------------------------------ merci : gerbe de particules
function initBurst(chart: ChartApi | null) {
  const el = document.querySelector<HTMLElement>("[data-burst]");
  if (!el || !chart) return;
  window.setTimeout(() => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    chart.burst(x, y, 1.4);
    chart.ping(x, y, 1);
    window.setTimeout(() => el.isConnected && chart.ping(x, y, 0.7), 320);
    window.setTimeout(() => el.isConnected && chart.ping(x, y, 0.45), 640);
  }, 700);
}

export function initPages(chart: ChartApi | null) {
  initProjectFilter();
  initGalaxy();
  initContact(chart);
  initBurst(chart);
}
