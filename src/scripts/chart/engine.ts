import { field } from "./field";
import {
  FIELD_FRAG,
  MAX_PINGS,
  PARTICLE_FRAG,
  PARTICLE_VERT,
  QUAD_VERT,
} from "./shaders";

/**
 * « La carte » : fond vivant du site.
 *  - passe 1 : relief bathymétrique en lignes de niveau (fragment shader) ;
 *  - passe 2 : particules qui suivent les isolignes comme des courants et qui,
 *    à la demande d'une page, s'assemblent en formation (spirale du logo,
 *    orbites, anneaux sonar).
 * Le canvas est persisté entre les pages : la carte ne redémarre jamais.
 */

export type Formation = "spiral" | "ring" | "sonar";

export interface ChartApi {
  /** Onde sonar libre (clic, frappe clavier…). */
  ping(x: number, y: number, amp?: number): void;
  /** Onde pilotée par la transition de page : rayon imposé à chaque frame. */
  sweep(x: number, y: number, r: number): void;
  endSweep(): void;
  /** Déplace la carte (en unités de relief) : effet de cap lors d'une navigation. */
  travel(dx: number, dy: number): void;
  /** Élément servant d'ancre à la formation de particules de la page. */
  setAnchor(el: HTMLElement | null): void;
  /** Souffle radial sur les particules. */
  burst(x: number, y: number, strength?: number): void;
}

interface Ping {
  x: number;
  y: number;
  r: number;
  amp0: number;
  amp: number;
  speed: number;
  age: number;
  life: number;
}

const K = 16; // échantillons de traîne
const HIST_DT = 1 / 30;
const PARALLAX = 0.32;
const STREAK = 0.45;
const TAU = Math.PI * 2;
const SPIRAL_TURNS = 3.25;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function createChart(host: HTMLElement): ChartApi | null {
  const canvas = host.querySelector("canvas");
  if (!canvas) return null;

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reduceQuery.matches;

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const lowPower =
    coarse ||
    Math.min(window.innerWidth, window.innerHeight) < 640 ||
    (navigator.hardwareConcurrency ?? 8) <= 4;

  const NM = lowPower ? 1000 : 2300; // particules recrutables en formation
  const NA = lowPower ? 220 : 520; // particules toujours « courant »
  const N = NM + NA;
  let dprCap = lowPower ? 1.5 : 2;
  let pixelBudget = lowPower ? 1.6e6 : 4.4e6;

  // ---------------------------------------------------------------- état
  let W = 1;
  let H = 1;
  let dpr = 1;
  let scale = 560;
  let time = 40 + Math.random() * 400;
  let boost = 0;

  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const ix = new Float32Array(N);
  const iy = new Float32Array(N);
  const life = new Float32Array(N);
  const maxLife = new Float32Array(N);
  const spd = new Float32Array(N);
  const u = new Float32Array(N);
  const jit = new Float32Array(N);
  const tone = new Float32Array(N);
  const vis = new Float32Array(N);
  const alpha = new Float32Array(N);
  const size = new Float32Array(N);
  const colR = new Float32Array(N);
  const colG = new Float32Array(N);
  const colB = new Float32Array(N);
  const hx = new Float32Array(N * K);
  const hy = new Float32Array(N * K);
  let head = 0;
  let histAcc = 0;

  const TW = new Float32Array(K + 1);
  for (let j = 0; j <= K; j++) TW[j] = Math.pow(1 - j / K, 1.6) * 0.62;

  const lineBytes = new ArrayBuffer(N * K * 2 * 12);
  const lineF = new Float32Array(lineBytes);
  const lineU = new Uint8ClampedArray(lineBytes);
  const pointBytes = new ArrayBuffer(N * 16);
  const pointF = new Float32Array(pointBytes);
  const pointU = new Uint8ClampedArray(pointBytes);

  // carte : décalage (unités de relief) = voyage + parallaxe de scroll
  let travelX = 64 + Math.random() * 40;
  let travelY = 64 + Math.random() * 40;
  let travelTX = travelX;
  let travelTY = travelY;
  let bgScroll = window.scrollY * PARALLAX;

  // pointeur
  let mx = -9999;
  let my = -9999;
  let mxs = -9999;
  let mys = -9999;
  let mouseK = 0;
  let mouseKT = 0;

  // ondes
  const pings: Ping[] = [];
  let sweepOn = false;
  let sweepX = 0;
  let sweepY = 0;
  let sweepR = 0;
  let sweepAmp = 0;
  const pingData = new Float32Array(MAX_PINGS * 4);

  // formation
  let anchor: HTMLElement | null = null;
  let formType: Formation = "spiral";
  let formDim = 1;
  let formShare = 1;
  let F = 0;
  let cx = 0;
  let cy = 0;
  let R = 200;
  let prevCx = 0;
  let prevCy = 0;
  let hasPrevCenter = false;
  let rot = Math.random() * TAU;

  const rand = Math.random;

  function resetHist(i: number) {
    const px = x[i];
    const py = y[i];
    for (let s = 0; s < K; s++) {
      hx[s * N + i] = px;
      hy[s * N + i] = py;
    }
  }

  function spawn(i: number) {
    x[i] = rand() * (W + 40) - 20;
    y[i] = rand() * (H + 40) - 20;
    ix[i] = 0;
    iy[i] = 0;
    life[i] = 0;
    maxLife[i] = 5 + rand() * 8;
    resetHist(i);
  }

  function seed() {
    for (let i = 0; i < N; i++) {
      spd[i] = rand();
      u[i] = rand();
      jit[i] = (rand() + rand() + rand() - 1.5) / 1.5;
      tone[i] = rand();
      size[i] = 1.5 + rand() * 1.9;
      vis[i] = 0;
      spawn(i);
      life[i] = rand() * maxLife[i];
    }
  }

  // ------------------------------------------------------------------ GL
  let fieldProg: WebGLProgram | null = null;
  let partProg: WebGLProgram | null = null;
  let quadVao: WebGLVertexArrayObject | null = null;
  let lineVao: WebGLVertexArrayObject | null = null;
  let pointVao: WebGLVertexArrayObject | null = null;
  let lineBuf: WebGLBuffer | null = null;
  let pointBuf: WebGLBuffer | null = null;
  const fu: Record<string, WebGLUniformLocation | null> = {};
  const pu: Record<string, WebGLUniformLocation | null> = {};
  let glReady = false;

  function compile(type: number, src: string): WebGLShader | null {
    const sh = gl!.createShader(type);
    if (!sh) return null;
    gl!.shaderSource(sh, src);
    gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
      console.warn("[chart] shader", gl!.getShaderInfoLog(sh));
      gl!.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(vsSrc: string, fsSrc: string): WebGLProgram | null {
    const vs = compile(gl!.VERTEX_SHADER, vsSrc);
    const fs = compile(gl!.FRAGMENT_SHADER, fsSrc);
    const prog = gl!.createProgram();
    if (!vs || !fs || !prog) return null;
    gl!.attachShader(prog, vs);
    gl!.attachShader(prog, fs);
    gl!.linkProgram(prog);
    if (!gl!.getProgramParameter(prog, gl!.LINK_STATUS)) {
      console.warn("[chart] link", gl!.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function setupGL(): boolean {
    const g = gl!;
    fieldProg = link(QUAD_VERT, FIELD_FRAG);
    partProg = link(PARTICLE_VERT, PARTICLE_FRAG);
    if (!fieldProg || !partProg) return false;

    for (const name of [
      "u_res",
      "u_dpr",
      "u_time",
      "u_off",
      "u_scale",
      "u_mouse",
      "u_ping",
      "u_grid",
      "u_boost",
    ]) {
      fu[name] = g.getUniformLocation(fieldProg, name);
    }
    for (const name of ["u_view", "u_dpr", "u_point", "u_boost", "u_sizeMul"]) {
      pu[name] = g.getUniformLocation(partProg, name);
    }

    quadVao = g.createVertexArray();
    g.bindVertexArray(quadVao);
    const quad = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, quad);
    g.bufferData(
      g.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      g.STATIC_DRAW,
    );
    const qPos = g.getAttribLocation(fieldProg, "a_pos");
    g.enableVertexAttribArray(qPos);
    g.vertexAttribPointer(qPos, 2, g.FLOAT, false, 0, 0);

    const aPos = g.getAttribLocation(partProg, "a_pos");
    const aCol = g.getAttribLocation(partProg, "a_col");
    const aSize = g.getAttribLocation(partProg, "a_size");

    lineVao = g.createVertexArray();
    g.bindVertexArray(lineVao);
    lineBuf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, lineBuf);
    g.bufferData(g.ARRAY_BUFFER, lineBytes.byteLength, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(aPos);
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 12, 0);
    g.enableVertexAttribArray(aCol);
    g.vertexAttribPointer(aCol, 4, g.UNSIGNED_BYTE, true, 12, 8);
    if (aSize >= 0) g.vertexAttrib1f(aSize, 1);

    pointVao = g.createVertexArray();
    g.bindVertexArray(pointVao);
    pointBuf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, pointBuf);
    g.bufferData(g.ARRAY_BUFFER, pointBytes.byteLength, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(aPos);
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 16, 0);
    if (aSize >= 0) {
      g.enableVertexAttribArray(aSize);
      g.vertexAttribPointer(aSize, 1, g.FLOAT, false, 16, 8);
    }
    g.enableVertexAttribArray(aCol);
    g.vertexAttribPointer(aCol, 4, g.UNSIGNED_BYTE, true, 16, 12);

    g.bindVertexArray(null);
    g.disable(g.DEPTH_TEST);
    return true;
  }

  // ------------------------------------------------------------- taille
  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const prevW = W;
    const prevH = H;
    W = w;
    H = h;
    dpr = Math.min(
      window.devicePixelRatio || 1,
      dprCap,
      Math.sqrt(pixelBudget / (W * H)),
    );
    dpr = Math.max(0.6, dpr);
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas!.width !== cw || canvas!.height !== ch) {
      canvas!.width = cw;
      canvas!.height = ch;
    }
    scale = Math.max(360, Math.min(620, W * 0.44));
    if (Math.abs(prevW - W) > 80 || Math.abs(prevH - H) > 160) {
      for (let i = 0; i < N; i++) {
        if (x[i] > W + 20 || y[i] > H + 20) spawn(i);
      }
    }
  }

  // --------------------------------------------------------- simulation
  function readAnchor(dt: number) {
    let target = 0;
    if (anchor && anchor.isConnected) {
      const r = anchor.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      R = (Math.min(r.width, r.height) / 2) * 0.98;
      const visible =
        Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)) /
        Math.max(1, Math.min(r.height, H));
      target = clamp01(visible * 1.3);
    } else {
      anchor = null;
      hasPrevCenter = false;
    }
    F += (target - F) * (dt <= 0 ? 1 : 1 - Math.exp(-dt * 2.4));
    if (F < 0.001) F = 0;
  }

  function step(dt: number, snap: boolean) {
    const t = time;
    readAnchor(snap ? 0 : dt);

    // carte : voyage + parallaxe
    const ease = snap ? 1 : 1 - Math.exp(-dt * 2.6);
    const tdx = (travelTX - travelX) * ease;
    const tdy = (travelTY - travelY) * ease;
    travelX += tdx;
    travelY += tdy;
    const newBg = window.scrollY * PARALLAX;
    const sdy = newBg - bgScroll;
    bgScroll = newBg;
    const bgShiftX = -tdx * scale;
    const bgShiftY = -tdy * scale - sdy;

    let adx = 0;
    let ady = 0;
    if (anchor) {
      if (hasPrevCenter) {
        adx = cx - prevCx;
        ady = cy - prevCy;
        if (Math.abs(adx) > 600 || Math.abs(ady) > 600) {
          adx = 0;
          ady = 0;
        }
      }
      prevCx = cx;
      prevCy = cy;
      hasPrevCenter = true;
    }

    // pointeur
    const mk = snap ? 1 : 1 - Math.exp(-dt * 9);
    if (mxs < -9000) {
      mxs = mx;
      mys = my;
    } else {
      mxs += (mx - mxs) * mk;
      mys += (my - mys) * mk;
    }
    mouseK += (mouseKT - mouseK) * (snap ? 1 : 1 - Math.exp(-dt * 4));

    // ondes
    for (let p = pings.length - 1; p >= 0; p--) {
      const pg = pings[p];
      pg.age += dt;
      pg.r += pg.speed * dt;
      pg.speed *= Math.exp(-dt * 0.85);
      const k = 1 - pg.age / pg.life;
      if (k <= 0) pings.splice(p, 1);
      else pg.amp = pg.amp0 * Math.pow(k, 1.4);
    }
    sweepAmp += ((sweepOn ? 1 : 0) - sweepAmp) * (snap ? 1 : 1 - Math.exp(-dt * 7));

    rot += dt * 0.11;
    const sc = 1 / scale;
    const ox = travelX;
    const oy = travelY + bgScroll * sc;
    const E = 0.03;
    const kVis = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    const damp = Math.exp(-dt * 3.4);
    const pullK = snap ? 1 : 1 - Math.exp(-dt * 5.5);
    const activeCount = Math.floor(NM * formShare);
    const band = (R / SPIRAL_TURNS) * 0.25;
    const MR = 150;
    const MR2 = MR * MR;
    const useMouse = mouseK > 0.01 && !snap;
    const nP = pings.length;
    const M = 30;

    for (let i = 0; i < N; i++) {
      const member = i < NM;
      const wantForm = member && i < activeCount && F > 0.02;
      const tv = !member || wantForm || i % 9 === 0 ? 1 : 0;
      let vi = vis[i];
      if (tv === 0 && vi < 0.01) {
        vis[i] = 0;
        alpha[i] = 0;
        continue;
      }
      if (tv === 1 && vi < 0.005 && member) spawn(i);
      vi += (tv - vi) * kVis;
      vis[i] = vi;

      const Fi = wantForm ? F : 0;
      let px = x[i];
      let py = y[i];

      // décalage de la carte (parallaxe / voyage) ou de l'ancre
      const sx = bgShiftX + (adx - bgShiftX) * Fi;
      const sy = bgShiftY + (ady - bgShiftY) * Fi;
      if (sx !== 0 || sy !== 0) {
        px += sx;
        py += sy;
        const hk = 1 - STREAK + (0.85 - (1 - STREAK)) * Fi;
        const hsx = sx * hk;
        const hsy = sy * hk;
        for (let s = 0; s < K; s++) {
          hx[s * N + i] += hsx;
          hy[s * N + i] += hsy;
        }
      }

      // courant : tangent aux lignes de niveau
      if (dt > 0) {
        const nx = px * sc + ox;
        const ny = py * sc + oy;
        const h0 = field(nx, ny, t);
        const gx = field(nx + E, ny, t) - h0;
        const gy = field(nx, ny + E, t) - h0;
        const gl2 = Math.sqrt(gx * gx + gy * gy) + 1e-7;
        const sp = (24 + 36 * spd[i]) * (1 - 0.82 * Fi) * dt;
        px += (-gy / gl2) * sp;
        py += (gx / gl2) * sp;

        let jx = ix[i];
        let jy = iy[i];
        if (useMouse) {
          const dx = px - mxs;
          const dy = py - mys;
          const d2 = dx * dx + dy * dy;
          if (d2 < MR2 && d2 > 1) {
            const d = Math.sqrt(d2);
            const f = 1 - d / MR;
            const k = f * f * mouseK * 1700 * dt;
            jx += (dx / d - (dy / d) * 0.6) * k;
            jy += (dy / d + (dx / d) * 0.6) * k;
          }
        }
        for (let p = 0; p < nP; p++) {
          const pg = pings[p];
          const dx = px - pg.x;
          const dy = py - pg.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const q = d - pg.r;
          if (q > -32 && q < 32) {
            const k = pg.amp * (1 - Math.abs(q) / 32) * 1000 * dt;
            jx += (dx / d) * k;
            jy += (dy / d) * k;
          }
        }
        if (sweepAmp > 0.01) {
          const dx = px - sweepX;
          const dy = py - sweepY;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const q = d - sweepR;
          if (q > -40 && q < 40) {
            const k = sweepAmp * (1 - Math.abs(q) / 40) * 1500 * dt;
            jx += (dx / d) * k;
            jy += (dy / d) * k;
          }
        }
        px += jx * dt;
        py += jy * dt;
        ix[i] = jx * damp;
        iy[i] = jy * damp;
      }

      // formation
      let fa = 0;
      let fr = 150;
      let fg = 200;
      let fb = 235;
      let teleported = false;
      if (Fi > 0) {
        let tx = cx;
        let ty = cy;
        if (formType === "spiral") {
          let ui = u[i] - dt * 0.034 * (0.55 + 0.9 * spd[i]);
          if (ui < 0.003) {
            ui = 1;
            teleported = true;
          }
          u[i] = ui;
          const sN = Math.sqrt(ui);
          const th = sN * SPIRAL_TURNS * TAU + rot;
          const rr = R * (0.05 + 0.95 * sN) + jit[i] * band;
          tx = cx + Math.cos(th) * rr;
          ty = cy + Math.sin(th) * rr;
          fa = (1 - smooth(0.86, 1, sN)) * smooth(0.03, 0.2, sN) * 0.95;
          const k = smooth(0.05, 0.95, sN);
          if (tone[i] > 0.87) {
            fr = 44;
            fg = 221;
            fb = 155;
          } else {
            fr = 236 - 180 * k;
            fg = 246 - 104 * k;
            fb = 255 - 30 * k;
          }
        } else if (formType === "ring") {
          const ring = i % 3;
          const dir = ring === 1 ? -1 : 1;
          const th = u[i] * TAU + dir * t * (0.22 - ring * 0.05) * (0.7 + 0.6 * spd[i]);
          const rr = R * (1 + ring * 0.13) + jit[i] * (2 + ring * 3);
          tx = cx + Math.cos(th) * rr;
          ty = cy + Math.sin(th) * rr;
          fa = 0.8 - ring * 0.2;
          if (tone[i] > 0.7) {
            fr = 44;
            fg = 221;
            fb = 155;
          }
        } else {
          // sonar : anneaux concentriques qui s'élargissent
          const rings = 5;
          const base = Math.floor(u[i] * rings) / rings;
          let ph = base + t * 0.075;
          ph -= Math.floor(ph);
          const th = jit[i] * Math.PI * 1.2 + tone[i] * TAU + t * 0.05;
          const rr = R * (0.08 + 0.92 * ph);
          tx = cx + Math.cos(th) * rr;
          ty = cy + Math.sin(th) * rr;
          fa = (1 - ph) * (1 - ph) * smooth(0, 0.08, ph) * 0.95;
          if (ph < dt * 0.075 * 1.5 + 0.004) teleported = true;
          fr = 44 + 120 * ph;
          fg = 221;
          fb = 155 + 70 * ph;
        }
        if (teleported) {
          px = tx;
          py = ty;
        } else {
          const pull = pullK * Fi;
          px += (tx - px) * pull;
          py += (ty - py) * pull;
        }
      }

      // vie des particules « courant »
      const lf = life[i] + dt * (1 - Fi);
      life[i] = lf;
      if (lf > maxLife[i]) {
        spawn(i);
        alpha[i] = 0;
        continue;
      }
      if (Fi < 0.5) {
        let wrapped = false;
        if (px < -M) {
          px += W + 2 * M;
          wrapped = true;
        } else if (px > W + M) {
          px -= W + 2 * M;
          wrapped = true;
        }
        if (py < -M) {
          py += H + 2 * M;
          wrapped = true;
        } else if (py > H + M) {
          py -= H + 2 * M;
          wrapped = true;
        }
        if (wrapped) teleported = true;
      }

      x[i] = px;
      y[i] = py;
      if (teleported) resetHist(i);

      const mintAmb = tone[i] < 0.18;
      const la = Math.sin(Math.PI * Math.min(1, lf / maxLife[i]));
      const aa = la * (mintAmb ? 0.55 : 0.36);
      alpha[i] = (aa * (1 - Fi) + fa * formDim * Fi) * vi;
      const ar = mintAmb ? 44 : 140;
      const ag = mintAmb ? 221 : 190;
      const ab = mintAmb ? 155 : 228;
      colR[i] = ar + (fr - ar) * Fi;
      colG[i] = ag + (fg - ag) * Fi;
      colB[i] = ab + (fb - ab) * Fi;
    }

    if (snap) {
      for (let i = 0; i < N; i++) resetHist(i);
    } else {
      histAcc += dt;
      if (histAcc >= HIST_DT) {
        histAcc = histAcc % HIST_DT;
        hx.set(x, head * N);
        hy.set(y, head * N);
        head = (head + 1) % K;
      }
    }
  }

  // -------------------------------------------------------------- rendu
  function render() {
    if (!glReady) return;
    const g = gl!;
    g.viewport(0, 0, canvas!.width, canvas!.height);

    pingData.fill(0);
    let slot = 0;
    if (sweepAmp > 0.01) {
      pingData[0] = sweepX;
      pingData[1] = sweepY;
      pingData[2] = sweepR;
      pingData[3] = sweepAmp * 1.25;
      slot = 1;
    }
    for (let p = pings.length - 1; p >= 0 && slot < MAX_PINGS; p--, slot++) {
      const pg = pings[p];
      pingData[slot * 4] = pg.x;
      pingData[slot * 4 + 1] = pg.y;
      pingData[slot * 4 + 2] = pg.r;
      pingData[slot * 4 + 3] = pg.amp;
    }

    g.disable(g.BLEND);
    g.useProgram(fieldProg);
    g.uniform2f(fu.u_res, canvas!.width, canvas!.height);
    g.uniform1f(fu.u_dpr, dpr);
    g.uniform1f(fu.u_time, time);
    g.uniform2f(fu.u_off, travelX, travelY + bgScroll / scale);
    g.uniform1f(fu.u_scale, scale);
    g.uniform3f(fu.u_mouse, mxs, mys, mouseK);
    g.uniform4fv(fu.u_ping, pingData);
    g.uniform2f(fu.u_grid, (travelX * scale) % 168, (travelY * scale + bgScroll) % 168);
    g.uniform1f(fu.u_boost, boost);
    g.bindVertexArray(quadVao);
    g.drawArrays(g.TRIANGLES, 0, 3);

    // particules
    let lv = 0;
    let pv = 0;
    const K2 = K * 2;
    for (let i = 0; i < N; i++) {
      const a = alpha[i];
      if (a < 0.012) continue;
      const r = colR[i];
      const gg = colG[i];
      const b = colB[i];
      const a255 = a * 255;
      let x0 = x[i];
      let y0 = y[i];

      const po = pv * 4;
      pointF[po] = x0;
      pointF[po + 1] = y0;
      pointF[po + 2] = size[i];
      const pb = pv * 16 + 12;
      pointU[pb] = r;
      pointU[pb + 1] = gg;
      pointU[pb + 2] = b;
      pointU[pb + 3] = a255;
      pv++;

      for (let j = 0; j < K; j++) {
        const a0 = a255 * TW[j];
        if (a0 < 1.5) break;
        const s = (head - 1 - j + K2) % K;
        const x1 = hx[s * N + i];
        const y1 = hy[s * N + i];
        let o = lv * 3;
        let ob = lv * 12 + 8;
        lineF[o] = x0;
        lineF[o + 1] = y0;
        lineU[ob] = r;
        lineU[ob + 1] = gg;
        lineU[ob + 2] = b;
        lineU[ob + 3] = a0;
        lv++;
        o += 3;
        ob += 12;
        lineF[o] = x1;
        lineF[o + 1] = y1;
        lineU[ob] = r;
        lineU[ob + 1] = gg;
        lineU[ob + 2] = b;
        lineU[ob + 3] = a255 * TW[j + 1];
        lv++;
        x0 = x1;
        y0 = y1;
      }
    }

    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.useProgram(partProg);
    g.uniform2f(pu.u_view, W, H);
    g.uniform1f(pu.u_dpr, dpr);
    g.uniform1f(pu.u_boost, boost);

    g.uniform1f(pu.u_sizeMul, 1);
    if (lv > 0) {
      g.bindVertexArray(lineVao);
      g.bindBuffer(g.ARRAY_BUFFER, lineBuf);
      g.bufferSubData(g.ARRAY_BUFFER, 0, lineU, 0, lv * 12);
      g.uniform1f(pu.u_point, 0);
      g.drawArrays(g.LINES, 0, lv);
    }
    if (pv > 0) {
      g.bindVertexArray(pointVao);
      g.bindBuffer(g.ARRAY_BUFFER, pointBuf);
      g.bufferSubData(g.ARRAY_BUFFER, 0, pointU, 0, pv * 16);
      if (!lowPower) {
        g.uniform1f(pu.u_point, -1);
        g.uniform1f(pu.u_sizeMul, 9);
        g.drawArrays(g.POINTS, 0, pv);
      }
      g.uniform1f(pu.u_point, 1);
      g.uniform1f(pu.u_sizeMul, 1);
      g.drawArrays(g.POINTS, 0, pv);
    }
    g.bindVertexArray(null);
  }

  // ------------------------------------------------------------- boucle
  let raf = 0;
  let last = 0;
  let slowFrames = 0;
  let frames = 0;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) return;
    // qualité adaptative : si la machine peine, on allège le canvas
    frames++;
    if (frames > 90) {
      if (dt > 0.03) slowFrames++;
      else if (slowFrames > 0) slowFrames -= 0.25;
      if (slowFrames > 45 && pixelBudget > 0.7e6) {
        pixelBudget *= 0.62;
        dprCap = Math.max(0.75, dprCap - 0.35);
        slowFrames = 0;
        resize();
      }
    }
    if (dt > 0.05) dt = 0.05;
    time += dt;
    if (boost < 1) boost = Math.min(1, boost + dt / 1.1);
    step(dt, false);
    render();
  }

  let staticQueued = false;
  function renderStatic() {
    if (staticQueued) return;
    staticQueued = true;
    requestAnimationFrame(() => {
      staticQueued = false;
      boost = 1;
      travelX = travelTX;
      travelY = travelTY;
      for (let i = 0; i < N; i++) {
        if (life[i] < maxLife[i] * 0.3) life[i] = maxLife[i] * 0.5;
      }
      step(0, true);
      step(0, true);
      render();
    });
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduced) {
      renderStatic();
      return;
    }
    if (document.hidden) return;
    last = performance.now();
    frames = 0;
    raf = requestAnimationFrame(frame);
  }

  // --------------------------------------------------------- événements
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      mx = e.clientX;
      my = e.clientY;
      mouseKT = 1;
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    mouseKT = 0;
  });
  window.addEventListener("blur", () => {
    mouseKT = 0;
  });
  document.addEventListener("visibilitychange", start);
  window.addEventListener(
    "scroll",
    () => {
      if (reduced) renderStatic();
    },
    { passive: true },
  );
  reduceQuery.addEventListener("change", (e) => {
    reduced = e.matches;
    start();
  });
  new ResizeObserver(() => {
    resize();
    if (reduced) renderStatic();
  }).observe(host);

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    glReady = false;
    cancelAnimationFrame(raf);
  });
  canvas.addEventListener("webglcontextrestored", () => {
    glReady = setupGL();
    start();
  });

  // ---------------------------------------------------------- démarrage
  resize();
  seed();
  glReady = setupGL();
  if (!glReady) return null;
  host.dataset.ready = "true";
  start();

  return {
    ping(px, py, amp = 0.7) {
      if (reduced) return;
      if (pings.length >= MAX_PINGS - 1) pings.shift();
      pings.push({
        x: px,
        y: py,
        r: 0,
        amp0: amp,
        amp,
        speed: 560,
        age: 0,
        life: 1.7,
      });
    },
    sweep(px, py, r) {
      if (reduced) return;
      sweepOn = true;
      sweepX = px;
      sweepY = py;
      sweepR = r;
    },
    endSweep() {
      sweepOn = false;
    },
    travel(dx, dy) {
      travelTX += dx;
      travelTY += dy;
      if (reduced) renderStatic();
    },
    setAnchor(el) {
      anchor = el;
      hasPrevCenter = false;
      if (el) {
        const type = el.dataset.formation;
        formType = type === "ring" || type === "sonar" ? type : "spiral";
        formDim = Number(el.dataset.formationAlpha ?? 1) || 1;
        formShare =
          Number(el.dataset.formationShare ?? (formType === "spiral" ? 1 : 0.45)) || 1;
      }
      if (reduced) renderStatic();
    },
    burst(px, py, strength = 1) {
      if (reduced) return;
      for (let i = 0; i < N; i++) {
        const dx = x[i] - px;
        const dy = y[i] - py;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        const k = (strength * 900 * (0.4 + rand())) / (1 + d / 160);
        ix[i] += (dx / d) * k;
        iy[i] += (dy / d) * k;
      }
    },
  };
}
