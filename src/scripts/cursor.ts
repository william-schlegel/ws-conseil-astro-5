/**
 * Curseur d'accompagnement : un anneau qui suit le pointeur natif, grossit sur
 * les liens et devient une pastille libellée sur les éléments `data-cursor`.
 * L'élément est persisté entre les pages, on ne l'initialise donc qu'une fois.
 */
export function initCursor() {
  const el = document.getElementById("cursor");
  if (!el || el.dataset.bound) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.dataset.bound = "true";

  const label = el.querySelector<HTMLElement>(".cursor-label");
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let on = false;
  let raf = 0;

  const render = () => {
    x += (tx - x) * 0.24;
    y += (ty - y) * 0.24;
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    raf =
      Math.abs(tx - x) + Math.abs(ty - y) > 0.1
        ? requestAnimationFrame(render)
        : 0;
  };

  const interactive =
    "[data-cursor], a, button, summary, [role='button'], input, textarea, select, label";

  const update = (target: EventTarget | null) => {
    const node = target instanceof Element ? target.closest(interactive) : null;
    const text =
      node?.closest("[data-cursor]")?.getAttribute("data-cursor") ?? "";
    const isField = node?.matches("input, textarea, select") ?? false;
    el.classList.toggle("is-label", text !== "");
    el.classList.toggle("is-link", !!node && text === "" && !isField);
    el.classList.toggle("is-on", on && !isField);
    if (label && text) label.textContent = text;
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!on) {
        on = true;
        x = tx;
        y = ty;
      }
      update(e.target);
      if (!raf) raf = requestAnimationFrame(render);
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    on = false;
    el.classList.remove("is-on");
  });
  window.addEventListener("pointerdown", () => el.classList.add("is-down"));
  window.addEventListener("pointerup", () => el.classList.remove("is-down"));
  document.addEventListener("astro:after-swap", () => {
    el.classList.remove("is-label", "is-link");
  });
}
