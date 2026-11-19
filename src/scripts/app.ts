import { createChart, type ChartApi } from "./chart/engine";
import { initCursor } from "./cursor";
import { destroyMotion, initMotion } from "./motion";
import { initPages } from "./pages";
import { initTransitions } from "./transitions";

/**
 * Point d'entrée client. Ce module n'est exécuté qu'une fois (ClientRouter) :
 * la carte et le curseur vivent pendant toute la visite, le reste est
 * réinitialisé à chaque page.
 */

declare global {
  interface Window {
    __wsc?: boolean;
  }
}

let chart: ChartApi | null = null;
let chartTried = false;

function ensureChart(): ChartApi | null {
  if (chart || chartTried) return chart;
  const host = document.getElementById("chart");
  if (!host) return null;
  chartTried = true;
  try {
    chart = createChart(host);
  } catch (err) {
    console.warn("[chart] indisponible", err);
    chart = null;
  }
  return chart;
}

window.__wsc = true;
document.documentElement.classList.add("js");

initTransitions(() => chart);

window.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0) return;
    chart?.ping(e.clientX, e.clientY, 0.55);
  },
  { passive: true },
);

document.addEventListener("astro:before-swap", () => {
  destroyMotion();
  chart?.setAnchor(null);
});

document.addEventListener("astro:page-load", () => {
  const c = ensureChart();
  c?.setAnchor(document.querySelector<HTMLElement>("[data-formation]"));
  initCursor();
  initMotion();
  initPages(c);
});
