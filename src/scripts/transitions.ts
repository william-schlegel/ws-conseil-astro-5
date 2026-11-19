import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from "astro:transitions/client";
import type { ChartApi } from "./chart/engine";
import {
  projectBriefTransitionName,
  projectImageTransitionName,
  projectTitleTransitionName,
} from "../lib/projectTransitions";
import { prefersReducedMotion } from "./motion";

/**
 * Transition de page « onde sonar ».
 * Au clic, une onde part du pointeur : elle efface l'ancienne page et révèle
 * la nouvelle dans son sillage (masques CSS sur les snapshots root), pendant
 * que le shader dessine l'anneau et que la carte change de cap.
 * Le rayon est piloté ici pour que masque et anneau restent en phase.
 */

const SWEEP_MS = 880;
const NAV_ORDER = ["/", "/projects", "/project", "/skills", "/about", "/contact"];

function navIndex(pathname: string): number {
  const first = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
  const i = NAV_ORDER.indexOf(first);
  return i === -1 ? NAV_ORDER.length : i;
}

function nameCard(card: Element, on: boolean) {
  const slug = card.getAttribute("data-pcard");
  if (!slug) return;
  const names: Record<string, string> = {
    title: projectTitleTransitionName(slug),
    brief: projectBriefTransitionName(slug),
    image: projectImageTransitionName(slug),
  };
  card.querySelectorAll<HTMLElement>("[data-vt]").forEach((el) => {
    const name = names[el.dataset.vt ?? ""];
    if (name) el.style.viewTransitionName = on ? name : "";
  });
}

export function initTransitions(getChart: () => ChartApi | null) {
  let origin: { x: number; y: number } | null = null;
  let pending: {
    vt: ViewTransition;
    from: URL;
    to: URL;
    back: boolean;
  } | null = null;

  document.addEventListener(
    "click",
    (e) => {
      const link =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link) return;
      if (e.detail === 0) {
        const r = link.getBoundingClientRect();
        origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      } else {
        origin = { x: e.clientX, y: e.clientY };
      }
    },
    true,
  );

  document.addEventListener("astro:before-preparation", (e) => {
    const ev = e as TransitionBeforePreparationEvent;
    document
      .querySelectorAll("[data-pcard]")
      .forEach((card) => nameCard(card, false));
    const card = ev.sourceElement?.closest("[data-pcard]");
    if (card) nameCard(card, true);
  });

  document.addEventListener("astro:before-swap", (e) => {
    const ev = e as TransitionBeforeSwapEvent;
    pending = {
      vt: ev.viewTransition,
      from: ev.from,
      to: ev.to,
      back: ev.direction === "back",
    };
  });

  document.addEventListener("astro:after-swap", () => {
    const root = document.documentElement;
    root.classList.add("js");
    const nav = pending;
    pending = null;
    if (!nav) return;

    // Retour d'une page projet : la carte correspondante reprend ses noms
    // pour que titre, résumé et image reviennent s'y loger.
    const fromProject = nav.from.pathname.match(/^\/project\/([^/]+)/);
    let namedCard: Element | null = null;
    if (fromProject) {
      namedCard = document.querySelector(
        `[data-pcard="${CSS.escape(fromProject[1])}"]`,
      );
      if (namedCard) nameCard(namedCard, true);
    }
    const release = () => {
      if (namedCard) nameCard(namedCard, false);
    };

    const chart = getChart();
    const delta = navIndex(nav.to.pathname) - navIndex(nav.from.pathname);
    const heading = delta === 0 ? (nav.back ? -1 : 1) : Math.sign(delta);
    chart?.travel(heading * 0.85, 0.22);

    if (prefersReducedMotion()) {
      nav.vt.finished.finally(release);
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const o = origin ?? { x: w / 2, y: h * 0.42 };
    origin = null;
    const maxR =
      Math.hypot(Math.max(o.x, w - o.x), Math.max(o.y, h - o.y)) + 130;

    root.style.setProperty("--ping-x", `${o.x}px`);
    root.style.setProperty("--ping-y", `${o.y}px`);
    root.style.setProperty("--ping-r", "0px");

    let raf = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      root.style.removeProperty("--ping-x");
      root.style.removeProperty("--ping-y");
      root.style.removeProperty("--ping-r");
      chart?.endSweep();
      release();
    };

    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (done) return;
        const p = Math.min(1, (now - t0) / SWEEP_MS);
        // départ franc, arrivée amortie : front d'onde
        const e = 1 - Math.pow(1 - p, 2.6);
        const r = maxR * e;
        root.style.setProperty("--ping-r", `${r.toFixed(1)}px`);
        chart?.sweep(o.x, o.y, r - 12);
        if (p < 1) raf = requestAnimationFrame(tick);
        else chart?.endSweep();
      };
      raf = requestAnimationFrame(tick);
    };

    nav.vt.ready.then(run, finish);
    nav.vt.finished.finally(finish);
  });
}
