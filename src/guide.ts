// Page guide : couleurs d'élément, ciel animé, braises, clips et liens.
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource-variable/inter";
import { ELEMENTS, ELEMENT_IDS, STYLE_IDS, STYLES, type ElementId, type FxMessage, type Point, type StyleId } from "./fx";
import { playEffect } from "./fx-play";
import { createStage } from "./guide-stage";
import { dictionary, type Language } from "./i18n";
import { STYLE_ICONS } from "./fx-icons";

/** Liens à renseigner. Vide : le bouton reste visible et signale qu'il arrive bientôt. */
const LINKS: Record<string, string> = {
  store: "",
  patreon: "",
};

/** La page est en anglais, ou en français sous /fr/. Les noms viennent du dictionnaire de l'extension. */
const lang: Language = document.documentElement.lang === "fr" ? "fr" : "en";
const words = dictionary(lang);
const elementName = (id: ElementId) => words[`element.${id}`];
const styleName = (id: StyleId) => words[`style.${id}`];
const TEXT = {
  en: { soon: "Coming soon", copy: "Click to copy", noWebgl: "Your browser cannot show the effects here (WebGL 2 is off)." },
  fr: { soon: "Bientôt disponible", copy: "Cliquer pour copier", noWebgl: "Ton navigateur ne peut pas afficher les effets ici (WebGL 2 est désactivé)." },
}[lang];

type Rgb = [number, number, number];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Teintes d'un élément, éclaircies quand elles se perdraient sur le fond sombre. */
function tones(id: ElementId) {
  const [d, m, l] = ELEMENTS[id].palette as unknown as [Rgb, Rgb, Rgb];
  const mid = luma(m) < 0.3 ? mix(m, l, 0.45) : m;
  return { dark: d, mid, light: l };
}

// --- Élément courant --------------------------------------------------------

let current: ElementId = "feu";
let target = tones(current);
const shown = { dark: [...target.dark] as Rgb, mid: [...target.mid] as Rgb, light: [...target.light] as Rgb };
let autoCycle = !reducedMotion;
const label = document.getElementById("current-element");

function setElement(id: ElementId, byUser = false) {
  current = id;
  target = tones(id);
  if (byUser) autoCycle = false;
  if (!tinting) requestAnimationFrame(tint);
  if (label) label.textContent = elementName(id);
  for (const b of document.querySelectorAll<HTMLElement>(".el")) b.classList.toggle("active", b.dataset.id === id);
}

/**
 * Les couleurs de la page glissent vers celles du nouvel élément, en une seconde environ.
 * Les variables CSS ne s'animent pas d'elles-mêmes : elles sont mises à jour à chaque image.
 */
let tinting = false;
let lastTint = 0;
function tint(now: number) {
  const step = reducedMotion ? 1 : 1 - Math.exp(-(lastTint ? now - lastTint : 16) / 280);
  lastTint = now;
  let gap = 0;
  for (const k of ["dark", "mid", "light"] as const) {
    shown[k] = mix(shown[k], target[k], step);
    gap = Math.max(gap, ...shown[k].map((v, i) => Math.abs(v - target[k][i])));
  }
  const root = document.documentElement.style;
  root.setProperty("--el-dark", css(shown.dark));
  root.setProperty("--el-mid", css(shown.mid));
  root.setProperty("--el-light", css(shown.light));
  tinting = gap > 0.002;
  if (tinting) requestAnimationFrame(tint);
  else lastTint = 0;
}

const elementsBox = document.getElementById("elements")!;
for (const id of ELEMENT_IDS) {
  const t = tones(id);
  const b = document.createElement("button");
  b.className = "el";
  b.dataset.id = id;
  b.style.setProperty("--d", css(t.dark));
  b.style.setProperty("--m", css(t.mid));
  b.style.setProperty("--l", css(t.light));
  b.innerHTML = `<span class="orb"></span>${elementName(id)}`;
  b.addEventListener("click", (e) => {
    setElement(id, true);
    const r = b.querySelector(".orb")!.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 0.6);
    e.stopPropagation();
  });
  elementsBox.append(b);
}

// --- Scène : un clic sur un style le joue avec les shaders de l'extension -------

/** Une case de la scène vaut 100 unités ; la scène fait 16 × 9 cases. */
const DPI = 100;
const cell = (x: number, y: number): Point => ({ x: x * DPI, y: y * DPI });
const CASTER = cell(3.5, 4.5);
const FOE = cell(11.5, 3.5);
const FOE_2 = cell(13, 6.5);
const ON_CASTER: StyleId[] = ["aura", "transformation", "soin", "dome"];

const stageEl = document.getElementById("stage")!;
const stage = createStage(document.getElementById("stage-canvas") as HTMLCanvasElement, 16 * DPI);
const stageLabel = document.getElementById("stage-label")!;
let style: StyleId = "explosion";
let demo = !reducedMotion;

function cast(at?: Point) {
  if (!stage) return;
  stageLabel.textContent = `${styleName(style)} · ${elementName(current)}`;
  const message = (m: Partial<FxMessage>): FxMessage => ({
    element: current, style, size: "M", seed: Math.random() * 100, at: FOE, ...m,
  });
  const play = (m: Partial<FxMessage>) => playEffect(message(m), DPI, stage.animate);
  const directed = STYLES[style].directed;
  if (at) {
    if (style === "mur") play({ from: { x: at.x, y: at.y - 2 * DPI }, at: { x: at.x, y: at.y + 2 * DPI } });
    else play(directed ? { from: CASTER, at } : { at });
    return;
  }
  if (style === "chaine") play({ from: CASTER, at: FOE }).then(() => play({ from: FOE, at: FOE_2 }));
  else if (style === "mur") play({ from: cell(8, 1.8), at: cell(8, 7.2) });
  else if (style === "pluie") play({ at: cell(12, 5) });
  else if (directed) play({ from: CASTER, at: FOE });
  else play({ at: ON_CASTER.includes(style) ? CASTER : FOE });
}

function selectStyle(id: StyleId) {
  style = id;
  for (const b of document.querySelectorAll<HTMLElement>(".style-card")) b.classList.toggle("active", b.dataset.id === id);
}

const stylesBox = document.getElementById("styles")!;
for (const id of STYLE_IDS) {
  const card = document.createElement("button");
  card.className = "style-card";
  card.dataset.id = id;
  card.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${STYLE_ICONS[id]}</svg>${styleName(id)}`;
  card.addEventListener("click", () => {
    demo = false;
    selectStyle(id);
    cast();
  });
  stylesBox.append(card);
}
selectStyle(style);

stageEl.addEventListener("click", (e) => {
  demo = false;
  const r = stageEl.getBoundingClientRect();
  cast({ x: ((e.clientX - r.left) / r.width) * 16 * DPI, y: ((e.clientY - r.top) / r.height) * 9 * DPI });
});
if (!stage) stageLabel.textContent = TEXT.noWebgl;

// Tant que personne n'a cliqué, la scène se joue toute seule quand elle est à l'écran.
let stageVisible = false;
new IntersectionObserver(([e]) => (stageVisible = e.isIntersecting), { threshold: 0.4 }).observe(stageEl);
setInterval(() => {
  if (!demo || !stageVisible || document.hidden) return;
  selectStyle(STYLE_IDS[(STYLE_IDS.indexOf(style) + 1) % STYLE_IDS.length]);
  cast();
}, 2600);

setElement(current);
if (autoCycle) {
  setInterval(() => {
    if (!autoCycle || !demo || document.hidden) return;
    setElement(ELEMENT_IDS[(ELEMENT_IDS.indexOf(current) + 1) % ELEMENT_IDS.length]);
  }, 4500);
}

// --- Ciel de l'ouverture (WebGL) ----------------------------------------------

const hero = document.querySelector<HTMLElement>(".hero")!;
const sky = document.getElementById("sky") as HTMLCanvasElement;
const mouse = { x: 0.7, y: 0.4 };
let heroVisible = true;
new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(hero);
hero.addEventListener("pointermove", (e) => {
  const r = hero.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width;
  mouse.y = 1 - (e.clientY - r.top) / r.height;
});

const FRAG = `
precision mediump float;
uniform vec2 res; uniform float time; uniform vec2 mouse;
uniform vec3 cDark, cMid, cLight;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = time * 0.04;
  vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 3.1));
  float n = fbm(p * 2.2 + q * 1.8 + vec2(0.0, -t * 2.0));
  vec2 m = (mouse - 0.5) * vec2(res.x / res.y, 1.0);
  float glow = exp(-3.2 * length(p - m));
  float rise = smoothstep(1.1, -0.2, uv.y);
  vec3 base = vec3(0.043, 0.035, 0.063);
  vec3 col = base + cDark * 0.55 * smoothstep(0.35, 0.9, n) * (0.4 + rise);
  col += cMid * 0.28 * pow(smoothstep(0.5, 1.0, n), 2.0) * (0.3 + rise);
  col += cMid * 0.22 * glow + cLight * 0.08 * glow * n;
  float stars = step(0.9975, hash(floor(gl_FragCoord.xy / 2.0))) * (0.5 + 0.5 * sin(time * 2.0 + hash(floor(gl_FragCoord.xy)) * 40.0));
  col += vec3(stars) * 0.5 * (1.0 - rise * 0.6);
  col *= 1.0 - 0.45 * length(uv - 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

function startSky() {
  const gl = sky.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const [uRes, uTime, uMouse, uDark, uMid, uLight] = ["res", "time", "mouse", "cDark", "cMid", "cLight"].map(u);
  const smooth = { x: mouse.x, y: mouse.y };
  const start = performance.now();

  const frame = () => {
    // Le ciel est calculé à mi-résolution : il est flou par nature.
    const w = Math.round(sky.clientWidth * 0.5), h = Math.round(sky.clientHeight * 0.5);
    if (sky.width !== w || sky.height !== h) { sky.width = w; sky.height = h; gl.viewport(0, 0, w, h); }
    smooth.x += (mouse.x - smooth.x) * 0.05;
    smooth.y += (mouse.y - smooth.y) * 0.05;
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, (performance.now() - start) / 1000);
    gl.uniform2f(uMouse, smooth.x, smooth.y);
    gl.uniform3fv(uDark, shown.dark);
    gl.uniform3fv(uMid, shown.mid);
    gl.uniform3fv(uLight, shown.light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = () => {
    if (heroVisible && !document.hidden) frame();
    requestAnimationFrame(loop);
  };
  if (reducedMotion) frame();
  else loop();
}
startSky();

// --- Braises et sorts lancés d'un clic (canvas 2D, toute la page) -------------

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; burst: boolean };
type Ring = { x: number; y: number; age: number; scale: number };
const embers = document.getElementById("embers") as HTMLCanvasElement;
const ctx = embers.getContext("2d")!;
const particles: Particle[] = [];
const rings: Ring[] = [];
const AMBIENT = innerWidth < 760 ? 25 : 60;
let dpr = 1;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  embers.width = innerWidth * dpr;
  embers.height = innerHeight * dpr;
}
addEventListener("resize", resize);
resize();

const ember = (): Particle => ({
  x: Math.random() * innerWidth,
  y: innerHeight + Math.random() * innerHeight * 0.5,
  vx: (Math.random() - 0.5) * 0.3,
  vy: -(0.3 + Math.random() * 0.8),
  life: 0,
  max: 400 + Math.random() * 500,
  size: 0.8 + Math.random() * 1.8,
  burst: false,
});

function burst(x: number, y: number, scale = 1) {
  if (reducedMotion) return;
  rings.push({ x, y, age: 0, scale });
  for (let i = 0; i < 70 * scale; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (1.5 + Math.random() * 6) * scale;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 0, max: 40 + Math.random() * 50, size: 1 + Math.random() * 2.5, burst: true });
  }
}

hero.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a, figure")) return;
  burst(e.clientX, e.clientY);
});

function tick() {
  requestAnimationFrame(tick);
  if (document.hidden) return;
  while (particles.filter((p) => !p.burst).length < AMBIENT) particles.push(ember());
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.globalCompositeOperation = "lighter";
  const light = css(shown.light), mid = css(shown.mid);

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.age++;
    const k = r.age / 45;
    if (k >= 1) { rings.splice(i, 1); continue; }
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = light;
    ctx.lineWidth = 3 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, (20 + 160 * Math.sqrt(k)) * r.scale, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 120 * r.scale);
    g.addColorStop(0, mid);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = (1 - k) ** 2 * 0.7;
    ctx.fillStyle = g;
    ctx.fillRect(r.x - 120 * r.scale, r.y - 120 * r.scale, 240 * r.scale, 240 * r.scale);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    if (p.burst) { p.vx *= 0.94; p.vy = p.vy * 0.94 - 0.04; }
    else p.vx += Math.sin((p.life + i * 13) / 40) * 0.01;
    p.x += p.vx;
    p.y += p.vy;
    const k = p.life / p.max;
    if (k >= 1 || p.y < -20) { particles.splice(i, 1); continue; }
    const alpha = p.burst ? 1 - k : Math.sin(k * Math.PI) * 0.55;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = k < 0.4 && p.burst ? light : mid;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.burst ? 1 - k * 0.5 : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
if (!reducedMotion) tick();

// --- En-tête, apparition au défilement ----------------------------------------

const top = document.querySelector(".top")!;
const menuButton = top.querySelector<HTMLButtonElement>(".menu-toggle")!;
const setMenu = (open: boolean) => {
  top.classList.toggle("open", open);
  menuButton.setAttribute("aria-expanded", String(open));
};
menuButton.addEventListener("click", () => setMenu(!top.classList.contains("open")));
for (const link of top.querySelectorAll("nav a")) link.addEventListener("click", () => setMenu(false));
const onScroll = () => top.classList.toggle("scrolled", scrollY > 40);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("shown"); reveal.unobserve(e.target); }
  },
  { threshold: 0.12 },
);
for (const el of document.querySelectorAll(".chapter .wrap, .band .wrap, .ritual li, .el, .style-card")) {
  el.classList.add("reveal");
  reveal.observe(el);
}

// --- Liens externes ------------------------------------------------------------

for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-link]")) {
  const url = LINKS[a.dataset.link ?? ""];
  if (url) {
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
  } else {
    a.classList.add("soon");
    a.title = TEXT.soon;
    a.addEventListener("click", (e) => e.preventDefault());
  }
}

// --- Clips : un emplacement tant que la vidéo n'existe pas ---------------------

for (const fig of document.querySelectorAll<HTMLElement>("figure.clip")) {
  const src = fig.dataset.src;
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.innerHTML = `<span>${src?.split("/").pop() ?? ""}</span>`;
  fig.prepend(slot);
  if (!src) continue;
  const video = document.createElement("video");
  Object.assign(video, { muted: true, loop: true, autoplay: true, playsInline: true, preload: "metadata" });
  video.addEventListener("loadeddata", () => slot.replaceWith(video));
  video.src = src;
}

// --- Copie de l'adresse du manifest ----------------------------------------------

for (const code of document.querySelectorAll<HTMLElement>("code.copy")) {
  code.title = TEXT.copy;
  code.addEventListener("click", async () => {
    await navigator.clipboard.writeText(code.textContent ?? "");
    code.classList.add("copied");
    setTimeout(() => code.classList.remove("copied"), 1400);
  });
}
