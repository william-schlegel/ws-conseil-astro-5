/**
 * Moteur d'animation des pages : révélations au scroll, texte découpé,
 * compteurs, aimantation, inclinaison 3D, parallaxe, défilants.
 * Tout est (ré)initialisé à chaque `astro:page-load` et nettoyé avant le swap.
 */

const finePointer = () =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Cleanup = () => void;
let cleanups: Cleanup[] = [];

interface ParallaxItem {
  el: HTMLElement;
  frame: HTMLElement;
  k: number;
}

interface MarqueeItem {
  anim: Animation;
  dir: number;
  rate: number;
}

let parallax: ParallaxItem[] = [];
let marquees: MarqueeItem[] = [];
let header: HTMLElement | null = null;
let progress: HTMLElement | null = null;
let rafId = 0;
let lastY = 0;
let lastT = 0;
let velocity = 0;
let dirty = true;

// ------------------------------------------------------------ split text
function splitWords(el: HTMLElement) {
  if (el.hasAttribute("data-split-ready")) return;
  let i = 0;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (!text.trim()) continue;
        const frag = document.createDocumentFragment();
        for (const part of text.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(" ");
            continue;
          }
          const w = document.createElement("span");
          w.className = "w";
          const wi = document.createElement("span");
          wi.className = "wi";
          wi.style.setProperty("--i", String(i++));
          wi.textContent = part;
          w.append(wi);
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
  el.setAttribute("data-split-ready", "");
}

// -------------------------------------------------------------- compteur
function runCount(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  if (prefersReducedMotion()) {
    el.textContent = String(target);
    return;
  }
  const duration = 1900;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = String(Math.round(target * e));
    if (p < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  el.textContent = "0";
  requestAnimationFrame(tick);
}

// --------------------------------------------------------------- reveals
function initReveals() {
  document.querySelectorAll<HTMLElement>("[data-split]").forEach(splitWords);

  // Contenu markdown : chaque bloc se révèle à son tour.
  document
    .querySelectorAll<HTMLElement>("[data-reveal-children] > *")
    .forEach((child) => {
      if (!child.hasAttribute("data-reveal")) {
        child.setAttribute("data-reveal", "");
      }
    });

  document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((parent) => {
    const stepMs = Number(parent.dataset.stagger) || 80;
    parent
      .querySelectorAll<HTMLElement>("[data-reveal], [data-split]")
      .forEach((child, i) => {
        if (!child.style.getPropertyValue("--d")) {
          child.style.setProperty("--d", `${i * stepMs}ms`);
        }
      });
  });

  const targets = document.querySelectorAll<HTMLElement>(
    "[data-reveal], [data-split], [data-count]",
  );
  const show = (el: HTMLElement) => {
    el.classList.add("is-in");
    if (el.dataset.count !== undefined) runCount(el);
  };

  if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
    targets.forEach(show);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target as HTMLElement);
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
  );
  targets.forEach((el) => io.observe(el));
  cleanups.push(() => io.disconnect());
}

// ----------------------------------------------------------- aimantation
function initMagnetic() {
  if (!finePointer() || prefersReducedMotion()) return;
  document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
    const k = Number(el.dataset.magnetic) || 0.3;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.translate = `${(dx * k).toFixed(1)}px ${(dy * k).toFixed(1)}px`;
    };
    const leave = () => {
      el.style.translate = "";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
  });
}

// ------------------------------------------------------------------ tilt
function initTilt() {
  if (!finePointer() || prefersReducedMotion()) return;
  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
    let frame = 0;
    const move = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top) / r.height;
        el.style.setProperty("--tx", ((nx - 0.5) * 2).toFixed(3));
        el.style.setProperty("--ty", ((ny - 0.5) * 2).toFixed(3));
        el.style.setProperty("--gx", `${(nx * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${(ny * 100).toFixed(1)}%`);
        el.classList.add("is-tilting");
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove("is-tilting");
      el.style.setProperty("--tx", "0");
      el.style.setProperty("--ty", "0");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
  });
}

// ------------------------------------------------------------- défilants
function initMarquees() {
  marquees = [];
  document.querySelectorAll<HTMLElement>("[data-marquee]").forEach((el) => {
    const track = el.querySelector<HTMLElement>("[data-marquee-track]");
    if (!track || track.dataset.cloned) return;
    track.dataset.cloned = "true";
    for (const child of Array.from(track.children)) {
      const clone = child.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      track.append(clone);
    }
    if (prefersReducedMotion()) return;
    const seconds = Number(el.dataset.marquee) || 40;
    const dir = el.dataset.marqueeDir === "-1" ? -1 : 1;
    const anim = track.animate(
      dir === 1
        ? [{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }]
        : [{ transform: "translateX(-50%)" }, { transform: "translateX(0)" }],
      { duration: seconds * 1000, iterations: Infinity, easing: "linear" },
    );
    marquees.push({ anim, dir, rate: 1 });
    cleanups.push(() => anim.cancel());
  });
}

// -------------------------------------------------------------- parallaxe
function initParallax() {
  parallax = [];
  if (prefersReducedMotion()) return;
  document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
    const frame = el.parentElement;
    if (!frame) return;
    parallax.push({ el, frame, k: Number(el.dataset.parallax) || 0.12 });
  });
}

// ---------------------------------------------------------- boucle scroll
function loop(now: number) {
  rafId = requestAnimationFrame(loop);
  const y = window.scrollY;
  const dt = Math.max(0.001, (now - lastT) / 1000);
  lastT = now;
  const inst = (y - lastY) / dt;
  velocity += (inst - velocity) * Math.min(1, dt * 8);
  if (Math.abs(velocity) < 0.5) velocity = 0;
  const moved = y !== lastY;
  lastY = y;

  for (const m of marquees) {
    const target = Math.max(-7, Math.min(7, 1 + velocity / 260));
    m.rate += (target - m.rate) * Math.min(1, dt * 5);
    m.anim.playbackRate = Math.abs(m.rate) < 0.05 ? 0.05 : m.rate;
  }

  if (!moved && !dirty) return;
  dirty = false;

  if (header) header.toggleAttribute("data-scrolled", y > 24);

  if (progress) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 40 ? Math.min(1, Math.max(0, y / max)) : 0;
    progress.style.setProperty("--p", p.toFixed(4));
    progress.toggleAttribute("data-visible", y > 320);
  }

  const vh = window.innerHeight;
  for (const item of parallax) {
    const r = item.frame.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) continue;
    const p = (r.top + r.height / 2 - vh / 2) / vh;
    item.el.style.translate = `0 ${(p * item.k * -100).toFixed(2)}%`;
  }
}

// ------------------------------------------------------------------- API
export function initMotion() {
  header = document.querySelector<HTMLElement>("[data-header]");
  progress = document.querySelector<HTMLElement>("[data-progress]");
  initReveals();
  initMagnetic();
  initTilt();
  initMarquees();
  initParallax();

  if (progress) {
    const el = progress;
    const toTop = () =>
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    el.addEventListener("click", toTop);
  }

  dirty = true;
  lastY = window.scrollY;
  lastT = performance.now();
  velocity = 0;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
  const onResize = () => {
    dirty = true;
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));
}

export function destroyMotion() {
  cancelAnimationFrame(rafId);
  for (const fn of cleanups) fn();
  cleanups = [];
  parallax = [];
  marquees = [];
  header = null;
  progress = null;
}
