/**
 * Effets calculés par la carte graphique : aucune image à fournir.
 * Écrits en SkSL. `model` est fourni par Owlbear pour les effets « VIEWPORT » : il donne la
 * position sur la carte par rapport à l'objet, qui est donc l'origine de l'effet.
 * Les couleurs sont renvoyées prémultipliées par l'opacité, comme l'attend Owlbear.
 *
 * `palette` contient les couleurs de l'élément : froide, moyenne, chaude.
 *
 * Un effet bref reçoit `t`, de 0 à 1, envoyé par l'extension. Un effet durable se sert de `time`,
 * l'horloge fournie par Owlbear : il s'anime sans aucun message et reste à sa pleine intensité.
 * `clock()` fait avancer le mouvement au même rythme dans les deux cas, en durée de l'effet bref ;
 * `life()` donne l'avancement de son apparition et de sa disparition.
 *
 * Tout style peut durer. Celui qui a un état stable le garde (`DURABLE`). Celui qui n'est qu'un
 * instant laisse une trace : la flèche plantée, la griffure (`still`), le sol brûlé (`scorch`).
 * Seule la téléportation, qui ne laisse rien, se rejoue après une courte pause (`LOOP`).
 * Le corps de ces effets lit `t` : `timing.main` le déclare pour eux, `BRIEF` le reçoit directement.
 */
interface Timing {
  uniform: string;
  clock: (seconds: number) => string;
  life: string;
  main: string;
}

const BRIEF: Timing = { uniform: "uniform float t;", clock: () => "t", life: "t", main: "" };
// Le modulo évite de perdre en précision au bout de plusieurs heures.
const DURABLE: Timing = {
  uniform: "uniform float time;",
  clock: (seconds) => `mod(time, 1000.0) / ${seconds.toFixed(1)}`,
  life: "0.5",
  main: "float t = life();",
};

// `cycle` : durée de l'effet en secondes, suivie d'une pause. La graine évite que tous se rejouent ensemble.
const LOOP_LIFE = "min(mod(mod(time, 1000.0) + seed * 7.0, cycle * 1.6) / cycle, 1.0)";
const LOOP: Timing = {
  uniform: "uniform float time;\nuniform float cycle;",
  clock: () => LOOP_LIFE,
  life: LOOP_LIFE,
  main: "float t = life();",
};

/**
 * Effet qui tient : un seul objet, du début à la fin. `appear` part de 0 pendant son apparition et
 * s'arrête à 0,5, le milieu de sa vie. Son mouvement ne dépend que de l'horloge : rien ne saute.
 */
const SUSTAINED: Timing = {
  ...DURABLE,
  uniform: "uniform float time;\nuniform float appear;",
  life: "appear",
};

/** L'effet figé à cet instant de son animation. */
const still = (moment: number): Timing => ({ ...DURABLE, life: moment.toFixed(2) });

const common = (timing: Timing, seconds: number) => `
uniform mat3 model;
uniform mat3 palette;
${timing.uniform}
uniform float seed;
uniform float warp;
uniform float unit;
uniform float sonic;

float clock() {
  return ${timing.clock(seconds)};
}
float life() {
  return ${timing.life};
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amplitude *= 0.5;
  }
  return value;
}
vec3 ramp(float heat) {
  return mix(
    mix(palette[0], palette[1], smoothstep(0.0, 0.45, heat)),
    palette[2],
    smoothstep(0.45, 1.0, heat)
  );
}
// Anneaux qui s'éloignent de la source : x est la distance, exprimée en nombre d'anneaux.
float waves(float x, float speed) {
  return pow(0.5 + 0.5 * sin((x - clock() * speed) * 6.2832), 6.0);
}
vec2 local(float2 coord) {
  vec2 p = (model * vec3(coord, 1.0)).xy;
  if (warp > 0.0) {
    // Ondulation exprimée en cases, pour rester la même quelle que soit la grille.
    vec2 q = p / unit;
    p += warp * unit * 0.09 * vec2(sin(q.y * 4.5 + clock() * 16.0 + seed), sin(q.x * 4.5 + clock() * 16.0 + seed));
  }
  return p;
}
`;

const explosion = (timing: Timing) => `${common(timing, 1.5)}
uniform vec3 smoke;
uniform float radius;
uniform float rough;
uniform float shock;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.4) return half4(0.0);

  float grow = 1.0 - pow(1.0 - clamp(t / 0.35, 0.0, 1.0), 3.0);
  vec2 outward = p / max(d, 0.001);
  float n = fbm(p * 3.2 * rough - outward * smoothstep(0.0, 0.45, d) * t * 1.6 + seed);

  // Nuage qui reste après l'explosion.
  float smokeEdge = 1.0 - d / (0.55 + 0.6 * t) + (fbm(p * 2.4 + seed + t * 0.5) - 0.5) * 1.1;
  float smokeAlpha = smoothstep(0.0, 0.45, smokeEdge)
    * smoothstep(0.18, 0.45, t) * (1.0 - smoothstep(0.6, 1.0, t)) * 0.72 * (1.0 - sonic);
  vec3 color = smoke * smokeAlpha;
  float alpha = smokeAlpha;

  // Boule d'énergie, qui s'éteint en grandissant.
  float body = 1.0 - d / max(grow * 0.92, 0.001) + (n - 0.5) * 1.15;
  float cooling = 1.0 - smoothstep(0.12, 0.72, t);
  float bodyAlpha = smoothstep(0.0, 0.16, body) * (1.0 - smoothstep(0.45, 0.82, t)) * (1.0 - shock * 0.85) * (1.0 - sonic);
  color = ramp(clamp(body * 1.25 * (0.3 + cooling), 0.0, 1.0)) * bodyAlpha + color * (1.0 - bodyAlpha);
  alpha = bodyAlpha + alpha * (1.0 - bodyAlpha);

  // Onde de choc, éclair du début et étincelles.
  float ringOffset = (d - grow * 1.22) / 0.035;
  float ring = exp(-ringOffset * ringOffset) * (1.0 - smoothstep(0.05, 0.38, t)) * 0.8;
  if (shock > 0.0) {
    // Ondes plus épaisses, dont une seconde qui part juste après la première.
    float wide = (d - grow * 1.22) / (0.035 + shock * 0.09);
    float secondGrow = 1.0 - pow(1.0 - clamp((t - 0.1) / 0.4, 0.0, 1.0), 3.0);
    float second = (d - secondGrow * 1.05) / (0.03 + shock * 0.06);
    ring = max(ring, exp(-wide * wide) * (1.0 - smoothstep(0.1, 0.5, t)) * shock);
    ring = max(ring, exp(-second * second) * smoothstep(0.1, 0.16, t) * (1.0 - smoothstep(0.25, 0.6, t)) * shock * 0.8);
  }
  float flash = exp(-d * d * 5.0) * (1.0 - smoothstep(0.0, 0.14, t));
  float sparks = 0.0;
  for (int i = 0; i < 18; i++) {
    float index = float(i) + seed;
    float angle = hash(vec2(index, 1.3)) * 6.2832;
    float speed = 0.55 + hash(vec2(index, 7.1)) * 0.75;
    vec2 spark = vec2(cos(angle), sin(angle)) * speed * pow(t, 0.55);
    vec2 offset = p - spark;
    sparks += exp(-dot(offset, offset) * 2600.0);
  }
  sparks *= (1.0 - smoothstep(0.35, 0.8, t)) * (1.0 - sonic);
  // Une onde sonore continue de se propager derrière le premier front.
  float echoes = sonic * waves(d * 5.0, 7.0) * (1.0 - smoothstep(grow * 1.1, grow * 1.25, d)) * (1.0 - smoothstep(0.35, 0.95, t)) * 0.85;

  float glow = clamp(ring + flash + sparks + echoes, 0.0, 1.0);
  color = palette[2] * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  return half4(color, alpha);
}
`;

const projectile = (timing: Timing) => `${common(timing, 1)}
uniform vec2 target;
uniform float width;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));

  float behind = t * len - along;
  float trailLength = min(len * 0.6, width * 9.0);
  if (behind < -width * 2.5 || behind > trailLength || abs(across) > width * 3.0) {
    return half4(0.0);
  }

  float headDistance = length(vec2(behind, across)) / width;
  float head = exp(-headDistance * headDistance * 1.3);

  // Traînée qui s'amincit, déformée par du bruit.
  float k = clamp(behind / trailLength, 0.0, 1.0);
  float flame = fbm(vec2(behind / width * 0.5 - t * 6.0 + seed, across / width * 0.9));
  float halfWidth = width * (1.0 - k) * (0.55 + flame);
  float trail = 0.0;
  if (behind > 0.0) {
    trail = smoothstep(1.0, 0.25, abs(across) / max(halfWidth, 0.001))
      * (1.0 - k) * smoothstep(0.0, width * 1.2, behind);
  }

  float heat = clamp(head + trail * 0.85, 0.0, 1.0);
  float alpha = clamp(smoothstep(0.03, 0.4, heat) + head, 0.0, 1.0);
  return half4(ramp(heat) * alpha, alpha);
}
`;

const rain = (timing: Timing) => `${common(timing, 3)}
uniform float radius;
uniform float stretch;
uniform float fallSpeed;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.2) return half4(0.0);

  float now = clock();
  float fade = smoothstep(0.0, 0.12, life()) * (1.0 - smoothstep(0.78, 1.0, life()));
  float mask = 1.0 - smoothstep(0.8, 1.08, d + (noise(p * 4.0 + seed) - 0.5) * 0.25);

  // Sol touché par la pluie.
  float pool = mask * smoothstep(0.42, 0.75, fbm(p * 3.0 + seed)) * 0.28 * fade;
  vec3 color = palette[1] * pool;
  float alpha = pool;

  // Gouttes, en trois couches de profondeur.
  float drops = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float l = float(layer);
    float cells = 5.0 + l * 2.5;
    vec2 q = p * cells + vec2(l * 3.7 + seed, -now * fallSpeed * (5.0 + l));
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    if (hash(id + l + seed) < 0.7) {
      f.x += (hash(id * 1.7 + l) - 0.5) * 0.6;
      f.y += (hash(id * 2.3 + l) - 0.5) * 0.6;
      float widthFalloff = exp(-f.x * f.x * 260.0);
      float lengthFalloff = 1.0 - smoothstep(0.0, stretch, abs(f.y));
      drops += widthFalloff * lengthFalloff * (1.0 - l * 0.2);
    }
  }

  // Éclaboussures au sol.
  float splashes = 0.0;
  for (int i = 0; i < 10; i++) {
    float index = float(i) + seed;
    float angle = hash(vec2(index, 2.1)) * 6.2832;
    float distance = sqrt(hash(vec2(index, 5.3))) * 0.85;
    float phase = fract(now * 3.0 + hash(vec2(index, 8.7)));
    vec2 offset = p - vec2(cos(angle), sin(angle)) * distance;
    float ringOffset = (length(offset) - phase * 0.1) / 0.01;
    splashes += exp(-ringOffset * ringOffset) * (1.0 - phase) * 0.7;
  }

  float glow = clamp((drops + splashes * 0.8) * mask * fade, 0.0, 1.0);
  color = ramp(0.55 + glow * 0.45) * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  return half4(color, alpha);
}
`;

const beam = (timing: Timing) => `${common(timing, 1)}
uniform vec2 target;
uniform float width;
uniform float jag;
uniform float radiant;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float reachMargin = width * 4.0;
  if (along < -reachMargin || along > len + reachMargin) return half4(0.0);
  if (abs(across) > width * (5.0 + jag * 7.0)) return half4(0.0);

  float reach = smoothstep(0.0, 0.2, t) * len;
  float fade = 1.0 - smoothstep(0.6, 1.0, t);

  // Le rayon ondule, ou se brise en zigzag pour la foudre, mais reste fixé à ses deux bouts.
  float ends = smoothstep(0.0, len * 0.08, along) * smoothstep(0.0, len * 0.08, len - along);
  float jitter = floor(clock() * 18.0) * (0.2 + jag * 0.8);
  float wobble = (fbm(vec2(along / width * (0.12 + jag * 0.12) + seed, jitter)) - 0.5) * width * (1.2 + jag * 8.0);
  // Une énergie pure file tout droit.
  float a = abs(across - wobble * ends * (1.0 - max(radiant, sonic))) / width;

  float core = exp(-a * a * 2.4);
  float halo = exp(-a * a * 0.25) * 0.42;
  float tip = 1.0 - smoothstep(reach - width, reach + width, along);
  float start = smoothstep(-width * 1.5, 0.0, along);

  // Éclat aux deux extrémités.
  vec2 toTarget = p - target;
  float hit = smoothstep(0.75, 1.0, reach / len) * exp(-dot(toTarget, toTarget) / (width * width * 5.0));
  float muzzle = exp(-dot(p, p) / (width * width * 3.0));

  if (sonic > 0.5) {
    // Anneaux qui filent vers la cible le long d'un trait à peine visible.
    float bend = along / width - a * a * 0.3;
    float pulses = waves(bend * 0.2, 11.0) * exp(-a * a * 0.2);
    float line = exp(-a * a * 7.0) * 0.3;
    float sound = clamp(((pulses + line) * tip * start + hit * 0.8 + muzzle * 0.4) * fade, 0.0, 1.0);
    float soundAlpha = smoothstep(0.02, 0.6, sound);
    return half4(ramp(sound) * soundAlpha, soundAlpha);
  }

  float heat = clamp(((core + halo) * tip * start + hit + muzzle * 0.45) * fade, 0.0, 1.0);
  float alpha = smoothstep(0.02, 0.45, heat);
  return half4(ramp(heat) * alpha, alpha);
}
`;

const cone = (timing: Timing) => `${common(timing, 1.2)}
uniform vec2 target;
uniform vec3 smoke;
uniform float rough;
uniform float radiant;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float r = length(p);
  if (r > len * 1.2 || along < -len * 0.1) return half4(0.0);

  float angle = atan(across, along);
  float reach = max((1.0 - pow(1.0 - clamp(t / 0.4, 0.0, 1.0), 2.0)) * len, 1.0);

  if (radiant > 0.5) {
    // Faisceaux qui partent du lanceur, sans le nuage qui ferait croire à de la poussière.
    float side = 1.0 - abs(angle) / 0.56;
    float front = 1.0 - r / reach;
    float mask = smoothstep(0.0, 0.3, side) * smoothstep(0.0, 0.14, front);
    float rays = 0.34 + pow(noise(vec2(angle * 13.0 + seed, seed)), 1.4) * 0.8
      + noise(vec2(angle * 31.0 - seed, clock() * 2.5)) * 0.2;
    float fade = 1.0 - smoothstep(0.5, 1.0, t);
    float light = mask * rays * (1.0 - r / len * 0.72) * fade;
    float source = exp(-r * r / (len * len * 0.012)) * fade * smoothstep(-0.2, 0.1, along / len);
    float heat = clamp(light * 1.25 + source + 0.3, 0.0, 1.0);
    float alpha = clamp(light * 1.05 + source, 0.0, 1.0);
    return half4(ramp(heat) * alpha, alpha);
  }

  if (sonic > 0.5) {
    // Arcs concentriques qui partent du lanceur, sans nuage ni fumée.
    float mask = smoothstep(0.0, 0.14, 1.0 - abs(angle) / 0.56) * smoothstep(0.0, 0.08, 1.0 - r / reach);
    float fade = 1.0 - smoothstep(0.5, 1.0, t);
    float arcs = waves(r / len * 5.5, 8.0);
    float sound = mask * (arcs * (1.0 - r / len * 0.5) + 0.07) * fade;
    float alpha = clamp(sound * 1.1, 0.0, 1.0);
    return half4(ramp(clamp(sound * 1.2 + 0.2, 0.0, 1.0)) * alpha, alpha);
  }

  float n = fbm(vec2(r / len * 5.0 * rough - clock() * 6.0 + seed, angle * 3.0 * rough));

  // Le cône s'ouvre à partir du lanceur, avec un bord irrégulier.
  float edge = 1.0 - abs(angle) / 0.56 + (n - 0.5) * 0.7 * smoothstep(0.0, 0.3, r / len);
  float front = 1.0 - r / reach + (n - 0.5) * 0.65;
  float mask = smoothstep(0.0, 0.42, edge) * smoothstep(0.0, 0.2, front) * smoothstep(0.0, 0.05, r / len);

  float fade = 1.0 - smoothstep(0.5, 1.0, t);
  float heat = clamp((1.0 - r / len + (n - 0.5) * 0.95) * 1.15 * (0.35 + fade * 0.65) + 0.08, 0.0, 1.0);
  float bodyAlpha = mask * fade;

  // Nuage qui traîne quand le souffle s'éteint.
  float smokeAlpha = mask * smoothstep(0.25, 0.55, t) * (1.0 - smoothstep(0.65, 1.0, t)) * 0.55
    * smoothstep(0.32, 0.6, fbm(vec2(r / len * 3.0 + seed, angle * 2.0 + clock())));
  vec3 color = smoke * smokeAlpha;
  float alpha = smokeAlpha;
  color = ramp(heat) * bodyAlpha + color * (1.0 - bodyAlpha);
  alpha = bodyAlpha + alpha * (1.0 - bodyAlpha);
  return half4(color, alpha);
}
`;

const aura = (timing: Timing) => `${common(timing, 2.2)}
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.9) return half4(0.0);

  float now = clock();
  float fade = smoothstep(0.0, 0.2, life()) * (1.0 - smoothstep(0.65, 1.0, life()));
  float angle = atan(p.y, p.x);

  // Cercle au sol, parcouru par une énergie qui tourne.
  // Bruit lu sur le cercle plutôt que sur l'angle, qui ferait une coupure là où il saute de -π à π.
  float turning = angle + now * 2.5;
  float swirl = fbm(vec2(cos(turning), sin(turning)) * 1.6 + vec2(seed, d * 4.0 - now * 3.0));
  float ringOffset = (d - 0.88 - (swirl - 0.5) * 0.1) / 0.085;
  float ring = exp(-ringOffset * ringOffset);
  float inside = (1.0 - smoothstep(0.1, 0.95, d)) * (0.08 + fbm(p * 3.0 + seed - now) * 0.4);
  inside += sonic * waves(d * 3.5, 4.0) * (1.0 - smoothstep(0.7, 0.92, d)) * 0.7;

  // Particules qui montent.
  float motes = 0.0;
  for (int i = 0; i < 26; i++) {
    float index = float(i) + seed;
    float a = hash(vec2(index, 3.3)) * 6.2832;
    float distance = 0.25 + hash(vec2(index, 6.1)) * 0.68;
    float phase = fract(now * 1.6 + hash(vec2(index, 9.2)));
    vec2 mote = vec2(cos(a) * distance, sin(a) * distance * 0.8 - phase * 0.9);
    vec2 offset = p - mote;
    motes += exp(-dot(offset, offset) * 900.0) * (1.0 - phase) * smoothstep(0.0, 0.15, phase);
  }

  float heat = clamp(ring * 0.9 + inside + motes * 1.2, 0.0, 1.0) * fade;
  float alpha = smoothstep(0.0, 0.5, heat);
  return half4(ramp(0.25 + heat * 0.75) * alpha, alpha);
}
`;

/**
 * Invisibilité : simple repère pour la table, le token reste dessous. Il se dissout d'abord dans un
 * éclat, puis il ne reste qu'un voile pâle qui ondule comme de l'air chaud, cerclé de pointillés qui
 * tournent lentement, avec quelques scintillements. Le repère est discret pour ne pas cacher la carte.
 */
const invisibility = (timing: Timing) => `${common(timing, 2.4)}
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.3) return half4(0.0);

  float now = clock();
  float l = life();
  float fade = smoothstep(0.0, 0.2, l) * (1.0 - smoothstep(0.8, 1.0, l));
  float angle = atan(p.y, p.x);
  vec3 pale = mix(palette[2], vec3(1.0), 0.45);

  // Dissolution : un disque lumineux rongé par le bruit, qui disparaît au début de l'effet.
  float gone = smoothstep(0.04, 0.38, l);
  float grain = fbm(p * 4.5 + seed);
  float disk = 1.0 - smoothstep(0.82, 0.92, d);
  float dissolve = disk * smoothstep(gone - 0.02, gone + 0.02, grain) * (1.0 - smoothstep(0.3, 0.42, l));
  float edgeOffset = (grain - gone) / 0.035;
  float edge = disk * exp(-edgeOffset * edgeOffset) * (1.0 - smoothstep(0.3, 0.42, l));

  // Voile : des ondes déformées qui courent du centre vers le bord, comme un mirage.
  float bend = fbm(p * 2.6 + vec2(seed, now * 0.7)) * 3.5;
  float ripples = pow(0.5 + 0.5 * sin(d * 16.0 + bend - now * 5.0), 10.0);
  float veil = (ripples * 0.45 + 0.1) * (1.0 - smoothstep(0.7, 0.95, d)) * smoothstep(0.15, 0.4, l);

  // Contour en pointillés qui tourne : douze tirets, donc aucune coupure entre -π et π.
  float dashes = smoothstep(0.1, 0.5, sin(angle * 12.0 + now * 2.0));
  float ringOffset = (d - 0.98) / 0.025;
  float ring = exp(-ringOffset * ringOffset) * (0.25 + 0.75 * dashes) * 0.8 * smoothstep(0.1, 0.35, l);

  // Scintillements : de petites croix qui s'allument et s'éteignent çà et là.
  float twinkles = 0.0;
  for (int i = 0; i < 9; i++) {
    float index = float(i) + seed;
    float a = hash(vec2(index, 4.1)) * 6.2832;
    float r = sqrt(hash(vec2(index, 7.7))) * 0.85;
    vec2 q = (p - vec2(cos(a), sin(a)) * r) * 60.0;
    float blink = pow(max(sin((now * 0.8 + hash(vec2(index, 1.9))) * 6.2832), 0.0), 4.0);
    float star = exp(-q.x * q.x * 0.6) * exp(-abs(q.y) * 0.35) + exp(-q.y * q.y * 0.6) * exp(-abs(q.x) * 0.35);
    twinkles += star * blink;
  }

  float bright = clamp(dissolve * 0.8 + edge + twinkles, 0.0, 1.0);
  float soft = clamp(veil + ring, 0.0, 1.0);
  float alpha = clamp(soft * 0.55 + bright, 0.0, 1.0) * fade;
  vec3 color = mix(pale, ramp(0.9), clamp(edge, 0.0, 1.0)) * alpha;
  return half4(color, alpha);
}
`;

const arrow = (timing: Timing) => `${common(timing, 1)}
uniform vec2 target;
uniform float width;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = abs(dot(p, vec2(-dir.y, dir.x)));

  // « behind » vaut 0 à la pointe et grandit vers l'arrière de la flèche.
  float behind = t * len - along;
  float shaftLength = width * 16.0;
  if (behind < -width || behind > shaftLength * 3.0 || across > width * 4.0) return half4(0.0);

  float headLength = width * 4.5;
  float head = 0.0;
  if (behind > 0.0 && behind < headLength) {
    head = 1.0 - smoothstep(0.75, 1.0, across / max(behind / headLength * width * 2.1, 0.001));
  }
  float shaft = (1.0 - smoothstep(0.45, 0.85, across / width))
    * smoothstep(headLength * 0.8, headLength, behind) * (1.0 - smoothstep(shaftLength * 0.98, shaftLength, behind));
  float fletching = 0.0;
  if (behind > shaftLength * 0.76 && behind < shaftLength) {
    float k = (behind - shaftLength * 0.76) / (shaftLength * 0.24);
    fletching = 1.0 - smoothstep(0.7, 1.0, across / (width * (0.9 + k * 1.3)));
  }
  float trace = exp(-across * across / (width * width * 0.5))
    * smoothstep(shaftLength * 3.0, shaftLength * 0.9, behind) * step(0.0, along) * 0.45;

  // Bord sombre pour que la flèche se détache aussi sur une carte claire.
  float solid = clamp(max(max(head, shaft), fletching), 0.0, 1.0);
  float heat = head > 0.5 ? 1.0 : (fletching > 0.5 && shaft < 0.5 ? 0.15 : 0.6);
  float alpha = solid + trace * (1.0 - solid);
  vec3 color = ramp(heat) * solid + palette[1] * trace * (1.0 - solid);
  return half4(color, alpha);
}
`;

/**
 * Coup de feu : éclair à la bouche du canon, traceur qui file en un instant, puis étincelles et
 * poussière à l'impact. La balle arrive à 45 % de l'effet (`BULLET_FLIGHT_SHARE`).
 */
const bullet = (timing: Timing) => `${common(timing, 1)}
uniform vec2 target;
uniform float width;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float margin = width * 16.0;
  if (along < -margin || along > len + margin || abs(across) > margin) return half4(0.0);

  float fly = clamp(t / 0.45, 0.0, 1.0);
  float impact = clamp((t - 0.45) / 0.55, 0.0, 1.0);
  float landed = step(0.45, t);

  // Traceur : un trait fin et très chaud, plus long que la balle, qui s'efface à l'impact.
  float head = fly * len;
  float behind = head - along;
  float streak = min(len * 0.4, width * 70.0);
  float a = across / width;
  float tracer = 0.0;
  if (along > 0.0 && along < len && behind > -width && behind < streak) {
    float tail = 1.0 - clamp(behind / streak, 0.0, 1.0);
    tracer = exp(-a * a * 1.6) * tail * tail * (1.0 - smoothstep(0.0, width, -behind)) * (1.0 - landed);
  }

  // Éclair à la bouche du canon : un cœur rond et une flamme vers l'avant, avec deux pointes sur les côtés.
  float muzzleFade = 1.0 - smoothstep(0.0, 0.2, t);
  float r = length(p) / width;
  float forward = along > 0.0 ? exp(-a * a * 0.35) * exp(-along / (width * 5.0)) : 0.0;
  float sides = exp(-along * along / (width * width * 0.8)) * exp(-abs(a) / 2.5) * 0.6;
  float muzzle = (exp(-r * r / 6.0) + forward + sides) * muzzleFade;

  // Impact : un éclair bref, des étincelles qui rebondissent vers le tireur et un peu de poussière.
  vec2 q = p - target;
  float hitFlash = exp(-dot(q, q) / (width * width * 5.0)) * (1.0 - smoothstep(0.0, 0.3, impact)) * landed;
  float sparks = 0.0;
  for (int i = 0; i < 8; i++) {
    float index = float(i) + seed;
    // Vers le tireur, à 75° près de chaque côté : tourner -dir évite atan, imprécis sur un tir horizontal.
    float turn = (hash(vec2(index, 3.1)) - 0.5) * 2.6;
    vec2 back = vec2(-dir.x * cos(turn) + dir.y * sin(turn), -dir.x * sin(turn) - dir.y * cos(turn));
    float speed = 5.0 + hash(vec2(index, 8.3)) * 7.0;
    vec2 spark = q - back * speed * width * pow(impact, 0.5);
    sparks += exp(-dot(spark, spark) / (width * width * 0.35));
  }
  sparks *= landed * (1.0 - smoothstep(0.3, 0.85, impact));
  float puffSize = width * (2.5 + impact * 6.0);
  float puff = (1.0 - smoothstep(0.3, 1.0, length(q) / puffSize + (fbm(q / width * 0.5 + seed) - 0.5) * 0.6))
    * landed * (1.0 - smoothstep(0.2, 1.0, impact)) * 0.55 * (1.0 - sonic);

  vec3 color = mix(palette[0], palette[1], 0.5) * puff;
  float alpha = puff;
  float heat = clamp(tracer + muzzle + hitFlash + sparks, 0.0, 1.0);
  float glow = smoothstep(0.02, 0.4, heat);
  color = ramp(0.55 + heat * 0.45) * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  return half4(color, alpha);
}
`;

/**
 * Tir de blaster : un trait de lumière court au cœur presque blanc, entouré d'un halo de la couleur
 * de l'élément, qui traverse l'écran sans laisser de traînée. Il touche la cible à 70 % de l'effet.
 */
const bolt = (timing: Timing) => `${common(timing, 1)}
uniform vec2 target;
uniform float width;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float margin = width * 10.0;
  if (along < -margin || along > len + margin || abs(across) > margin) return half4(0.0);

  // La pointe file jusqu'au-delà de la cible, pour que la queue du trait y entre à son tour.
  float boltLength = min(len * 0.45, width * 18.0);
  float fly = clamp(t / 0.7, 0.0, 1.0);
  float head = fly * (len + boltLength);
  float lo = max(head - boltLength, 0.0);
  float hi = min(head, len);
  float body = 0.0;
  float halo = 0.0;
  if (hi > lo) {
    float d = length(vec2(along - clamp(along, lo, hi), across)) / width;
    // Léger scintillement, comme un trait d'énergie instable.
    float flicker = 0.9 + 0.1 * sin(clock() * 90.0 + seed);
    body = exp(-d * d * 3.0) * flicker;
    halo = exp(-d * d * 0.3) * 0.75;
  }

  float r = length(p) / width;
  float muzzle = exp(-r * r / 5.0) * (1.0 - smoothstep(0.0, 0.18, t));

  float hitAt = 0.7 * len / (len + boltLength);
  float impact = clamp((t - hitAt) / (1.0 - hitAt), 0.0, 1.0);
  float landed = step(hitAt, t);
  vec2 q = p - target;
  float hq = length(q) / width;
  float hitFlash = exp(-hq * hq / 4.0) * (1.0 - smoothstep(0.0, 0.45, impact)) * landed;
  float ringOffset = (hq - impact * 7.0) / 0.9;
  float ring = exp(-ringOffset * ringOffset) * (1.0 - smoothstep(0.1, 0.6, impact)) * landed * 0.7;
  float sparks = 0.0;
  for (int i = 0; i < 10; i++) {
    float index = float(i) + seed;
    float angle = hash(vec2(index, 5.7)) * 6.2832;
    float speed = 3.0 + hash(vec2(index, 2.9)) * 6.0;
    vec2 spark = q - vec2(cos(angle), sin(angle)) * speed * width * pow(impact, 0.6);
    sparks += exp(-dot(spark, spark) / (width * width * 0.08));
  }
  sparks *= landed * (1.0 - smoothstep(0.35, 0.9, impact));

  // Le cœur tire vers le blanc, le halo garde la couleur de l'élément.
  float core = clamp(body + muzzle + hitFlash, 0.0, 1.0);
  float outer = clamp(halo + ring + sparks * 0.8 + muzzle * 0.6 + hitFlash * 0.6, 0.0, 1.0);
  float glow = smoothstep(0.02, 0.5, outer);
  vec3 color = palette[1] * glow;
  float alpha = glow;
  float hot = smoothstep(0.15, 0.7, core);
  color = mix(palette[2], vec3(1.0), 0.55) * hot + color * (1.0 - hot);
  alpha = hot + alpha * (1.0 - hot);
  return half4(color, alpha);
}
`;

const slash = (timing: Timing) => `${common(timing, 1)}
uniform float radius;
uniform float claws;
uniform float dir;

half4 main(float2 coord) {
  ${timing.main}
  vec2 raw = local(coord) / radius;
  if (length(raw) > 1.5) return half4(0.0);

  // Le sens choisi, sinon celui de la graine, identique chez tous les joueurs.
  float angle = dir >= 0.0 ? dir : hash(vec2(seed, 4.4)) * 6.2832;
  float c = cos(angle);
  float s = sin(angle);
  vec2 p = vec2(c * raw.x - s * raw.y, s * raw.x + c * raw.y);

  float cut = 0.0;
  float edge = 0.0;
  for (int i = 0; i < 3; i++) {
    float k = float(i) - 1.0;
    float weight = i == 1 ? 1.0 : claws;
    if (weight > 0.0) {
      // Trait courbe : large au milieu, en pointe aux deux bouts.
      float start = abs(k) * 0.07;
      float sweep = -1.0 + 2.3 * clamp((t - start) / 0.3, 0.0, 1.0);
      float x = p.x;
      float line = p.y - (0.3 * (x * x - 0.5) + k * 0.42);
      float thick = (claws > 0.0 ? 0.045 : 0.085) * max(1.0 - x * x, 0.0);
      float inside = (1.0 - smoothstep(thick * 0.55, thick, abs(line))) * (1.0 - smoothstep(sweep - 0.14, sweep, x));
      cut = max(cut, inside);
      float glowOffset = line / max(thick * 2.6, 0.01);
      edge = max(edge, exp(-glowOffset * glowOffset) * step(abs(x), 1.0) * (1.0 - smoothstep(sweep - 0.14, sweep, x)) * 0.5);
    }
  }

  // Éclats projetés au milieu du coup.
  float sparks = 0.0;
  for (int i = 0; i < 10; i++) {
    float index = float(i) + seed;
    float a = hash(vec2(index, 2.2)) * 6.2832;
    float speed = 0.35 + hash(vec2(index, 5.5)) * 0.8;
    vec2 offset = p - vec2(cos(a), sin(a)) * speed * pow(clamp((t - 0.12) * 1.4, 0.0, 1.0), 0.6);
    sparks += exp(-dot(offset, offset) * 1400.0);
  }
  sparks *= smoothstep(0.1, 0.16, t) * (1.0 - smoothstep(0.45, 0.8, t));
  ${timing === BRIEF ? "" : "sparks = 0.0;"}

  float fade = 1.0 - smoothstep(0.5, 1.0, t);
  float heat = clamp(cut + edge * 0.7 + sparks, 0.0, 1.0) * fade;
  float alpha = clamp(cut * fade + smoothstep(0.0, 0.7, edge * fade) + sparks * fade, 0.0, 1.0);
  return half4(ramp(0.25 + heat * 0.75) * alpha, alpha);
}
`;

const bite = (timing: Timing) => `${common(timing, 1)}
uniform float radius;

half4 main(float2 coord) {
  ${timing.main}
  vec2 raw = local(coord) / radius;
  if (length(raw) > 1.5) return half4(0.0);

  // La graine incline un peu la mâchoire, de la même façon chez tous les joueurs.
  float angle = (hash(vec2(seed, 4.4)) - 0.5) * 0.9;
  float c = cos(angle);
  float s = sin(angle);
  vec2 p = vec2(c * raw.x - s * raw.y, s * raw.x + c * raw.y);

  // Les deux rangées de crocs se referment d'un coup, puis se croisent légèrement.
  float shut = 1.0 - pow(1.0 - clamp(t / 0.24, 0.0, 1.0), 3.0);
  float gap = mix(0.62, -0.05, shut);
  float bitten = smoothstep(0.2, 0.26, t);

  float teeth = 0.0;
  float edge = 0.0;
  float heat = 0.0;
  float marks = 0.0;
  for (int jaw = 0; jaw < 2; jaw++) {
    float side = jaw == 0 ? -1.0 : 1.0;
    for (int i = 0; i < 5; i++) {
      float k = float(i) - 2.0;
      float x = k * 0.3 + side * 0.07;
      // La bouche s'arrondit vers les coins, et les crocs du milieu sont les plus longs.
      float tip = gap + 0.42 * x * x;
      float len = 0.4 - abs(k) * 0.05;
      float v = (p.y * side - tip) / len;
      if (v > 0.0 && v < 1.0) {
        float a = abs(p.x - x) / max(v * 0.105, 0.001);
        float fang = 1.0 - smoothstep(0.72, 0.9, a);
        float rim = 1.0 - smoothstep(0.9, 1.25, a);
        if (fang > teeth) heat = 1.0 - v * 0.55;
        teeth = max(teeth, fang);
        edge = max(edge, rim);
      }
      // Trous laissés par chaque croc.
      vec2 hole = p - vec2(x, side * (0.05 + 0.42 * x * x));
      marks += exp(-dot(hole, hole) * 900.0);
    }
  }

  // Éclats projetés quand la mâchoire claque.
  float sparks = 0.0;
  for (int i = 0; i < 10; i++) {
    float index = float(i) + seed;
    float a = hash(vec2(index, 2.2)) * 6.2832;
    float speed = 0.3 + hash(vec2(index, 5.5)) * 0.75;
    vec2 offset = p - vec2(cos(a), sin(a)) * speed * pow(clamp((t - 0.22) * 1.6, 0.0, 1.0), 0.6);
    sparks += exp(-dot(offset, offset) * 1300.0);
  }
  sparks *= bitten * (1.0 - smoothstep(0.5, 0.85, t));
  ${timing === BRIEF ? "" : "sparks = 0.0;"}
  float flash = exp(-dot(p, p) * 7.0) * bitten * (1.0 - smoothstep(0.26, 0.48, t)) * 0.8;

  float visible = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.5, 0.78, t));
  float toothAlpha = teeth * visible;
  float rimAlpha = edge * visible * (1.0 - teeth);
  float glow = clamp(flash + sparks, 0.0, 1.0);
  float markAlpha = clamp(marks, 0.0, 1.0) * bitten * (1.0 - smoothstep(0.72, 1.0, t));

  vec3 color = palette[1] * markAlpha;
  float alpha = markAlpha;
  color = ramp(0.8) * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  color = palette[0] * rimAlpha + color * (1.0 - rimAlpha);
  alpha = rimAlpha + alpha * (1.0 - rimAlpha);
  color = ramp(0.35 + heat * 0.65) * toothAlpha + color * (1.0 - toothAlpha);
  alpha = toothAlpha + alpha * (1.0 - toothAlpha);
  return half4(color, alpha);
}
`;

const meteor = (timing: Timing) => `${common(timing, 2.6)}
uniform vec3 smoke;
uniform float radius;
uniform float rough;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord) / radius;
  float d = length(p);
  // La chute dure jusqu'à IMPACT, le reste du temps appartient à l'explosion et au cratère.
  const float IMPACT = 0.3;

  if (t < IMPACT) {
    // La graine fait varier l'angle d'arrivée, de la même façon chez tous les joueurs.
    float tilt = -1.0 + (hash(vec2(seed, 3.1)) - 0.5) * 1.6;
    vec2 dir = normalize(vec2(tilt * 0.6, -1.0));
    float fall = t / IMPACT;
    vec2 head = dir * 3.6 * (1.0 - fall * fall);
    vec2 v = p - head;
    float along = dot(v, dir);
    float across = dot(v, vec2(-dir.y, dir.x));

    // Le météore grossit en approchant. Le cercle au sol annonce où il va tomber.
    float size = 0.13 + fall * 0.17;
    float ball = exp(-dot(v, v) / (size * size));
    float len = 2.6;
    float trail = 0.0;
    if (along > 0.0 && along < len) {
      float k = along / len;
      float flame = fbm(vec2(along * 2.4 - t * 26.0 + seed, across / size * 0.7));
      float halfWidth = size * (1.0 - k) * (0.5 + flame);
      trail = smoothstep(1.0, 0.2, abs(across) / max(halfWidth, 0.001)) * (1.0 - k) * smoothstep(0.0, size, along);
    }
    float mark = exp(-pow((d - 1.0) / 0.03, 2.0)) * smoothstep(0.05, 0.6, fall) * (0.7 + 0.3 * sin(t * 90.0));
    float shadow = (1.0 - smoothstep(0.1, 1.0, d)) * fall * fall * 0.5;

    float heat = clamp(ball * 1.3 + trail * 0.85, 0.0, 1.0);
    float alpha = clamp(smoothstep(0.03, 0.4, heat) + ball, 0.0, 1.0);
    vec3 color = ramp(heat) * alpha;
    float markAlpha = mark * (1.0 - alpha);
    color += palette[1] * markAlpha;
    alpha += markAlpha;
    return half4(color, alpha + shadow * (1.0 - alpha));
  }

  if (d > 1.6) return half4(0.0);
  float u = (t - IMPACT) / (1.0 - IMPACT);
  float grow = 1.0 - pow(1.0 - clamp(u / 0.3, 0.0, 1.0), 3.0);
  vec2 outward = p / max(d, 0.001);
  float n = fbm(p * 3.0 * rough - outward * smoothstep(0.0, 0.45, d) * u * 1.6 + seed);

  // Cratère noirci, parcouru de fissures brûlantes qui s'éteignent, et qui reste après la fumée.
  float linger = 1.0 - smoothstep(0.72, 1.0, u);
  float craterEdge = 0.62 + (fbm(p * 3.4 + seed) - 0.5) * 0.3;
  float crater = (1.0 - smoothstep(craterEdge - 0.14, craterEdge, d)) * smoothstep(0.02, 0.1, u) * linger * 0.88;
  float crack = abs(fbm(p * 5.0 + seed * 1.7) - 0.5);
  float embers = (1.0 - smoothstep(0.0, 0.035, crack)) * (1.0 - smoothstep(0.35, 0.85, u)) * crater;
  vec3 color = mix(smoke * 0.25, ramp(0.8), embers) * crater;
  float alpha = crater;

  // Colonne de fumée.
  float smokeEdge = 1.0 - d / (0.5 + 0.6 * u) + (fbm(p * 2.4 + seed + u * 0.5) - 0.5) * 1.1;
  float smokeAlpha = smoothstep(0.0, 0.45, smokeEdge) * smoothstep(0.14, 0.4, u) * (1.0 - smoothstep(0.55, 0.95, u)) * 0.75 * (1.0 - sonic);
  color = smoke * smokeAlpha + color * (1.0 - smokeAlpha);
  alpha = smokeAlpha + alpha * (1.0 - smokeAlpha);

  // Boule de feu de l'impact.
  float body = 1.0 - d / max(grow * 0.95, 0.001) + (n - 0.5) * 1.15;
  float cooling = 1.0 - smoothstep(0.1, 0.6, u);
  float bodyAlpha = smoothstep(0.0, 0.16, body) * (1.0 - smoothstep(0.32, 0.65, u)) * (1.0 - sonic);
  color = ramp(clamp(body * 1.25 * (0.3 + cooling), 0.0, 1.0)) * bodyAlpha + color * (1.0 - bodyAlpha);
  alpha = bodyAlpha + alpha * (1.0 - bodyAlpha);

  // Débris projetés : des blocs sombres, bordés de la couleur de l'élément.
  float rocks = 0.0;
  float rims = 0.0;
  for (int i = 0; i < 16; i++) {
    float index = float(i) + seed;
    float angle = hash(vec2(index, 1.7)) * 6.2832;
    float reach = 0.55 + hash(vec2(index, 6.3)) * 0.85;
    float size = 0.022 + hash(vec2(index, 8.9)) * 0.03;
    vec2 rock = vec2(cos(angle), sin(angle)) * reach * (1.0 - pow(1.0 - clamp(u / 0.55, 0.0, 1.0), 2.5));
    vec2 toRock = p - rock;
    // Contour anguleux, qui tourne : un bloc de roche, pas une bille.
    float facing = atan(toRock.y, toRock.x) + index * 5.0 + u * 9.0;
    float facets = 1.0 + 0.16 * sin(facing * 5.0) + 0.12 * sin(facing * 2.0 + index);
    float gap = length(toRock) / size * facets;
    rocks = max(rocks, 1.0 - smoothstep(0.75, 1.0, gap));
    rims = max(rims, exp(-gap * gap * 0.5));
  }
  float flying = smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.62, 0.86, u));
  float rimAlpha = rims * flying * 0.8 * (1.0 - rocks);
  color = ramp(0.75) * rimAlpha + color * (1.0 - rimAlpha);
  alpha = rimAlpha + alpha * (1.0 - rimAlpha);
  float rockAlpha = rocks * flying;
  color = smoke * 0.3 * rockAlpha + color * (1.0 - rockAlpha);
  alpha = rockAlpha + alpha * (1.0 - rockAlpha);

  // Onde de choc et éclair du choc.
  float ringOffset = (d - grow * 1.3) / 0.05;
  float ring = exp(-ringOffset * ringOffset) * (1.0 - smoothstep(0.08, 0.34, u));
  float flash = exp(-d * d * 3.0) * (1.0 - smoothstep(0.0, 0.14, u));
  float echoes = sonic * waves(d * 5.0, 6.0) * (1.0 - smoothstep(grow * 1.1, grow * 1.25, d)) * (1.0 - smoothstep(0.35, 0.95, u)) * 0.85;
  float glow = clamp(ring + flash + echoes, 0.0, 1.0);
  color = palette[2] * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  return half4(color, alpha);
}
`;

const heal = (timing: Timing) => `${common(timing, 1.8)}
uniform float radius;

half4 main(float2 coord) {
  ${timing.main}
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.9) return half4(0.0);

  float fade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.7, 1.0, t));
  float pulse = 0.75 + 0.25 * sin(clock() * 14.0);
  float glow = exp(-d * d * 2.2) * 0.42 * pulse;

  // Petites croix lumineuses qui montent.
  float crosses = 0.0;
  for (int i = 0; i < 14; i++) {
    float index = float(i) + seed;
    float x = (hash(vec2(index, 1.9)) - 0.5) * 1.7;
    float y = (hash(vec2(index, 3.7)) - 0.5) * 1.1;
    float phase = fract(clock() * 1.3 + hash(vec2(index, 6.3)));
    float size = 0.75 + hash(vec2(index, 8.1)) * 0.6;
    vec2 q = (p - vec2(x, y + 0.55 - phase * 1.35)) / size;
    float bar = max(
      exp(-q.x * q.x * 4200.0 - q.y * q.y * 260.0),
      exp(-q.y * q.y * 4200.0 - q.x * q.x * 260.0)
    );
    crosses += bar * smoothstep(0.0, 0.2, phase) * (1.0 - smoothstep(0.6, 1.0, phase));
  }

  float heat = clamp(glow + crosses * 1.4, 0.0, 1.0) * fade;
  float alpha = smoothstep(0.0, 0.45, heat);
  return half4(ramp(0.45 + heat * 0.55) * alpha, alpha);
}
`;

/** Départ : tout converge vers le centre. Arrivée : tout en repart. */
const PORTAL = `
half4 portal(vec2 p, float appear, float t) {
  float d = length(p);
  if (d > 1.5) return half4(0.0);

  float u = appear > 0.5 ? t : 1.0 - t;
  float spread = 1.0 - pow(1.0 - u, 2.5);
  float fade = appear > 0.5 ? 1.0 - smoothstep(0.55, 1.0, t) : smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.85, 1.0, t));

  float ringOffset = (d - spread) / 0.05;
  float ring = exp(-ringOffset * ringOffset) * 0.9;
  float flash = exp(-d * d * 14.0) * exp(-u * u * 18.0) * 1.3;

  float motes = 0.0;
  for (int i = 0; i < 22; i++) {
    float index = float(i) + seed;
    float a = hash(vec2(index, 1.1)) * 6.2832 + u * 2.4;
    float reach = spread * (0.45 + hash(vec2(index, 4.2)) * 0.75);
    vec2 offset = p - vec2(cos(a), sin(a)) * reach;
    motes += exp(-dot(offset, offset) * 1200.0);
  }

  float heat = clamp(ring + flash + motes, 0.0, 1.0) * fade;
  float alpha = smoothstep(0.0, 0.45, heat);
  return half4(ramp(0.3 + heat * 0.7) * alpha, alpha);
}
`;

const teleport = `${common(BRIEF, 1)}
uniform float radius;
uniform float appear;
${PORTAL}
half4 main(float2 coord) {
  return portal(local(coord) / radius, appear, t);
}
`;

/** En boucle, les deux extrémités se répondent dans le même effet. */
const teleportLoop = `${common(LOOP, 1)}
uniform float radius;
uniform vec2 target;
${PORTAL}
half4 main(float2 coord) {
  ${LOOP.main}
  vec2 p = local(coord);
  half4 leaving = portal(p / radius, 0.0, clamp(t / 0.7, 0.0, 1.0));
  half4 arriving = portal((p - target) / radius, 1.0, clamp((t - 0.3) / 0.7, 0.0, 1.0));
  return arriving + leaving * (1.0 - arriving.a);
}
`;

const wall = (timing: Timing) => `${common(timing, 3.5)}
uniform vec2 target;
uniform float width;
uniform float rough;

half4 main(float2 coord) {
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));

  // Le mur se dresse du premier clic vers le second, puis retombe.
  float reach = smoothstep(0.0, 0.22, life()) * len;
  float over = along - clamp(along, 0.0, reach);
  float d = length(vec2(over, across)) / width;
  if (d > 2.2) return half4(0.0);

  float n = fbm(vec2(along / width * 0.55 * rough + seed, across / width * 0.5 - clock() * 9.0));
  float sink = 1.0 - smoothstep(0.76, 1.0, life());
  float body = (1.0 - d + (n - 0.5) * 1.3) * sink;
  float alpha = smoothstep(0.0, 0.22, body) * smoothstep(0.0, 0.05, life());
  float heat = clamp(body * 1.5 + 0.05, 0.0, 1.0);
  return half4(ramp(heat) * alpha, alpha);
}
`;

const dome = (timing: Timing) => `${common(timing, 3)}
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float raw = length(p);
  if (raw > 1.15) return half4(0.0);

  // La bulle s'ouvre, tient, puis se referme sur elle-même.
  float open = 1.0 - pow(1.0 - clamp(life() / 0.22, 0.0, 1.0), 3.0);
  float close = smoothstep(0.82, 1.0, life());
  float size = max(open * (1.0 - close * 0.25), 0.001);
  float d = raw / size;
  if (d > 1.06) return half4(0.0);

  // Plus dense sur le bord, comme une sphère vue de haut.
  float rim = pow(clamp(d, 0.0, 1.0), 5.0);
  float n = fbm(p * 4.0 + vec2(seed, clock() * 3.0));
  float veil = 0.1 + smoothstep(0.42, 0.72, n) * 0.22;
  veil = mix(veil, 0.04 + waves(d * 4.5, 3.0) * 0.5, sonic);
  vec2 sheenOffset = p - vec2(-0.36, -0.42) * size;
  float sheen = exp(-dot(sheenOffset, sheenOffset) * 9.0) * 0.3;

  // Vague qui parcourt la bulle à l'ouverture.
  float waveOffset = (d - clamp(life() / 0.35, 0.0, 1.0)) / 0.09;
  float wave = exp(-waveOffset * waveOffset) * (1.0 - smoothstep(0.2, 0.4, life())) * 0.6;

  float edge = 1.0 - smoothstep(1.0, 1.06, d);
  float fade = 1.0 - close;
  float heat = clamp(rim + wave + sheen, 0.0, 1.0);
  float alpha = clamp(rim * 0.95 + veil + wave + sheen, 0.0, 1.0) * edge * fade;
  return half4(ramp(0.3 + heat * 0.7) * alpha, alpha);
}
`;

const cube = (timing: Timing) => `${common(timing, 3)}
uniform float radius;
uniform float angle;

float line(float distance, float width) {
  float offset = distance / width;
  return exp(-offset * offset);
}

half4 main(float2 coord) {
  // radius est ici la moitié du côté : la zone couvre exactement ce carré.
  vec2 turned = local(coord) / radius;
  float c = cos(angle);
  float s = sin(angle);
  vec2 p = vec2(c * turned.x + s * turned.y, c * turned.y - s * turned.x);
  vec2 a = abs(p);
  if (max(a.x, a.y) > 1.15) return half4(0.0);

  // Le cube se déploie depuis son centre, tient, puis se referme.
  float open = 1.0 - pow(1.0 - clamp(life() / 0.22, 0.0, 1.0), 3.0);
  float close = smoothstep(0.82, 1.0, life());
  float size = max(open * (1.0 - close * 0.25), 0.001);
  a /= size;
  float d = max(a.x, a.y);
  if (d > 1.06) return half4(0.0);

  // Vu de dessus : le bord au sol, la face du haut, et les arêtes qui les relient.
  float ground = pow(clamp(d, 0.0, 1.0), 7.0);
  float topEdge = line(d - 0.62, 0.016);
  float side = smoothstep(0.62, 0.68, d) * line(a.x - a.y, 0.018);
  float n = fbm(p * 4.0 + vec2(seed, clock() * 3.0));
  float veil = 0.11 + smoothstep(0.42, 0.72, n) * 0.2;
  if (d < 0.62) veil += 0.05;

  // Vague qui parcourt le cube à l'ouverture.
  float wave = line(d - clamp(life() / 0.35, 0.0, 1.0), 0.09) * (1.0 - smoothstep(0.2, 0.4, life())) * 0.6;

  float edge = 1.0 - smoothstep(1.0, 1.06, d);
  float fade = 1.0 - close;
  float lines = max(topEdge, side) * 0.75;
  float heat = clamp(ground + lines + wave, 0.0, 1.0);
  float alpha = clamp(ground * 0.95 + lines + veil + wave, 0.0, 1.0) * edge * fade;
  return half4(ramp(0.3 + heat * 0.7) * alpha, alpha);
}
`;

const cloud = (timing: Timing) => `${common(timing, 4)}
uniform vec3 smoke;
uniform float radius;
uniform float density;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.4) return half4(0.0);

  // Le nuage dérive lentement, avec un bord irrégulier qui se déforme.
  float now = clock() * 4.0;
  float edge = 1.0 - d + (fbm(p * 2.5 + seed + now * 0.18) - 0.5) * 0.55;
  float mask = smoothstep(0.0, 0.2, edge);
  float n = fbm(p * 3.2 + vec2(seed + now * 0.22, seed * 0.5 - now * 0.15));
  float envelope = smoothstep(0.0, 0.12, life()) * (1.0 - smoothstep(0.72, 1.0, life()));

  float alpha = mask * envelope * density * (0.72 + n * 0.5);
  alpha = clamp(alpha, 0.0, 1.0);
  vec3 color = mix(smoke, ramp(n * 0.8), 0.5);
  return half4(color * alpha, alpha);
}
`;

const transformation = (timing: Timing) => `${common(timing, 2.6)}
uniform float radius;

float gauss(float distance, float width) {
  float offset = distance / width;
  return exp(-offset * offset);
}

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 2.6) return half4(0.0);

  float now = clock();
  float grow = smoothstep(0.0, 0.16, life());
  float fade = 1.0 - smoothstep(0.74, 1.0, life());
  float breath = 0.94 + 0.06 * sin(now * 13.0 + seed);

  // Silhouette de flamme : large à la base, étirée et effilée vers le haut de l'écran.
  vec2 q = vec2(p.x, p.y + 0.38);
  float up = clamp(-q.y / 1.7, 0.0, 1.0);
  float tall = (q.y < 0.0 ? 1.7 : 0.82) * mix(0.35, 1.0, grow) * breath;
  float shape = length(vec2(q.x / mix(1.08, 0.5, up), q.y / tall));

  // Bruit étiré à la verticale qui file vers le haut : ce sont les langues de la flamme.
  float streak = fbm(vec2(p.x * 3.4 + seed, p.y * 0.9 + now * 8.0));
  float tongue = noise(vec2(p.x * 8.0 - seed, p.y * 1.3 + now * 15.0));
  float edge = 1.0 - shape + (streak - 0.5) * (0.55 + up * 0.95) + (tongue - 0.5) * (0.12 + up * 0.5);
  float flame = smoothstep(0.0, 0.3, edge);

  // Le centre reste presque clair : l'effet passe au-dessus du token et ne doit pas le cacher.
  float hollow = 0.1 + 0.9 * smoothstep(0.26, 0.7, d);
  float body = flame * (0.5 + streak * 0.75) * hollow;
  float heat = clamp(edge * 1.5 + (1.0 - smoothstep(0.35, 1.0, d)) * 0.55, 0.0, 1.0);

  // Halo au sol, qui respire autour du personnage.
  // Bruit lu sur le cercle plutôt que sur l'angle, qui ferait une coupure là où il saute de -π à π.
  float rippled = fbm(vec2(p.x, p.y) / max(d, 0.001) * 1.8 + vec2(seed, now * 6.0));
  float ground = gauss(d - 0.74 - 0.05 * sin(now * 9.0), 0.13) * (0.12 + rippled * 0.6) * grow;
  ground += sonic * waves(d * 2.6, 3.5) * smoothstep(0.45, 0.65, d) * (1.0 - smoothstep(1.5, 2.2, d)) * 0.55 * grow;

  // Étincelles arrachées par la montée de l'énergie.
  float sparks = 0.0;
  for (int i = 0; i < 18; i++) {
    float index = float(i) + seed;
    float x = (hash(vec2(index, 2.7)) - 0.5) * 1.8;
    float phase = fract(now * (2.6 + hash(vec2(index, 4.1)) * 2.0) + hash(vec2(index, 7.9)));
    vec2 spark = vec2(x + sin(phase * 7.0 + index) * 0.07, 0.45 - phase * 2.35);
    vec2 offset = (p - spark) * vec2(1.0, 0.42);
    sparks += exp(-dot(offset, offset) * 1500.0) * smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.6, 1.0, phase));
  }
  sparks *= grow;

  // Déclenchement : éclair et onde de choc. Un effet durable, à mi-vie, n'en montre rien.
  float burst = 1.0 - pow(1.0 - clamp(life() / 0.3, 0.0, 1.0), 3.0);
  float shock = gauss(d - burst * 2.1, 0.07 + burst * 0.05) * (1.0 - smoothstep(0.12, 0.36, life()));
  float flash = exp(-d * d * 1.8) * (1.0 - smoothstep(0.0, 0.14, life()));

  float glow = clamp(ground + sparks + shock * 0.9 + flash, 0.0, 1.0);
  float flameAlpha = clamp(body, 0.0, 1.0) * fade;
  float glowAlpha = glow * fade;
  vec3 color = ramp(heat) * flameAlpha;
  float alpha = flameAlpha;
  color = ramp(0.55 + glow * 0.45) * glowAlpha + color * (1.0 - glowAlpha);
  alpha = glowAlpha + alpha * (1.0 - glowAlpha);
  return half4(color, alpha);
}
`;

const flame = (timing: Timing) => `${common(timing, 3)}
uniform float radius;

// Vue plongeante à 75° : le sol est à peine écrasé et une hauteur ne monte à l'écran que d'un quart.
const float FLATTEN = 0.966;
const float LIFT = 0.259;
const float TALL = 2.2;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  if (length(p + vec2(0.0, 0.25)) > 2.0) return half4(0.0);

  float now = clock();
  float grow = smoothstep(0.0, 0.14, life());
  float fade = 1.0 - smoothstep(0.78, 1.0, life());
  float size = max(mix(0.25, 1.0, grow), 0.001);
  float breath = 0.96 + 0.04 * sin(now * 14.0 + seed);

  // Sol : lueur et braises autour du foyer.
  vec2 floorAt = vec2(p.x, p.y / FLATTEN);
  float ground = length(floorAt);
  float glow = exp(-ground * ground * 1.1) * (0.34 + 0.05 * sin(now * 16.0 + seed)) * (1.0 - smoothstep(1.0, 1.7, ground));
  float ring = 1.0 - smoothstep(0.0, 0.26, abs(ground - 1.06 * size));
  float embers = ring * smoothstep(0.66, 0.76, fbm(floorAt * 11.0 + vec2(seed, now * 1.5))) * 0.8;

  vec3 color = palette[1] * glow * grow * fade;
  float alpha = glow * grow * fade;
  float emberAlpha = clamp(embers, 0.0, 1.0) * grow * fade;
  color = ramp(0.65) * emberAlpha + color * (1.0 - emberAlpha);
  alpha = emberAlpha + alpha * (1.0 - emberAlpha);

  // Un disque au sol dont le côté haut de l'écran s'allonge en langues : un quart de leur hauteur réelle.
  float x = (p.x + (noise(vec2(p.y * 1.8 + now * 2.6, seed)) - 0.5) * 0.22 * (1.0 - smoothstep(-1.2, 0.2, p.y))) / size;
  float y = p.y / size;
  float crest = TALL * LIFT * (0.45 + 0.85 * noise(vec2(x * 2.6 + seed, now * 1.2)));
  float r = length(vec2(x, y / (y < 0.0 ? FLATTEN + crest : FLATTEN))) / breath;
  float top = 1.0 - smoothstep(-0.9, 0.25, y);
  float tongues = fbm(vec2(x * 3.4 + seed, y * 1.45 + now * 3.2));
  float licks = noise(vec2(x * 8.5 - seed, y * 2.4 + now * 5.4));
  float edge = 1.0 - r + (tongues - 0.5) * mix(0.55, 1.15, top) + (licks - 0.5) * mix(0.12, 0.5, top);
  float flameAlpha = smoothstep(0.0, 0.14, edge) * (0.84 + tongues * 0.24);

  // Le plus chaud au foyer, le plus froid au bout des langues, avec des veines plus sombres.
  float heat = clamp(edge * 1.0 + (tongues - 0.5) * 1.0 + (1.0 - smoothstep(0.0, 0.7, length(vec2(x, y)))) * 0.25 - top * 0.12, 0.0, 1.0);
  float bodyAlpha = clamp(flameAlpha, 0.0, 1.0) * fade;
  color = ramp(heat) * bodyAlpha + color * (1.0 - bodyAlpha);
  alpha = bodyAlpha + alpha * (1.0 - bodyAlpha);

  // Étincelles qui montent : elles restent au-dessus de leur point de départ, peu décalées à l'écran.
  float sparks = 0.0;
  for (int i = 0; i < 12; i++) {
    float index = float(i) + seed;
    float angle = hash(vec2(index, 2.7)) * 6.2832;
    float start = sqrt(hash(vec2(index, 5.3))) * 0.95;
    float spark = fract(now * (0.8 + hash(vec2(index, 4.1)) * 0.8) + hash(vec2(index, 7.9)));
    vec2 at = vec2(cos(angle), sin(angle) * FLATTEN) * start * (1.0 + spark * 0.25) - vec2(0.0, spark * 0.85);
    vec2 offset = p - at;
    sparks += exp(-dot(offset, offset) * 2200.0) * smoothstep(0.0, 0.12, spark) * (1.0 - smoothstep(0.55, 1.0, spark));
  }
  float sparkAlpha = clamp(sparks, 0.0, 1.0) * grow * fade;
  color = palette[2] * sparkAlpha + color * (1.0 - sparkAlpha);
  alpha = sparkAlpha + alpha * (1.0 - sparkAlpha);
  return half4(color, alpha);
}
`;

/** Ce qui reste après un impact : un sol noirci, des braises et de petites flammes qui s'attardent. */
const SCORCH_SKSL = `${common(DURABLE, 3)}
uniform vec3 smoke;
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.5) return half4(0.0);

  float now = clock();
  float edge = 1.0 - d + (fbm(p * 2.6 + seed) - 0.5) * 0.7;
  float patchAlpha = smoothstep(0.0, 0.22, edge) * 0.82;
  vec3 color = smoke * 0.28 * patchAlpha;
  float alpha = patchAlpha;

  // Fissures encore chaudes, qui rougeoient lentement.
  float crack = abs(fbm(p * 3.2 + seed * 1.7) - 0.5);
  float glowing = smoothstep(0.42, 0.7, noise(p * 3.0 + vec2(seed, now * 2.4)));
  float embers = (1.0 - smoothstep(0.0, 0.022, crack)) * glowing * smoothstep(0.0, 0.25, edge) * 0.85;
  color = ramp(0.8) * embers + color * (1.0 - embers);
  alpha = embers + alpha * (1.0 - embers);

  // Petites flammes qui naissent et s'éteignent par endroits.
  float tongues = fbm(p * 3.2 + vec2(seed, now * 3.4));
  float fire = smoothstep(0.56, 0.72, tongues) * smoothstep(0.1, 0.55, edge) * (1.0 - sonic);
  color = ramp(smoothstep(0.56, 0.86, tongues)) * fire + color * (1.0 - fire);
  alpha = fire + alpha * (1.0 - fire);

  // Une onde ne brûle pas : le sol continue de vibrer.
  float echo = sonic * waves(d * 4.0, 3.0) * smoothstep(0.0, 0.3, edge) * 0.6;
  color = palette[2] * echo + color * (1.0 - echo);
  alpha = echo + alpha * (1.0 - echo);
  return half4(color, alpha);
}
`;

export const EXPLOSION_SKSL = explosion(BRIEF);
export const PROJECTILE_SKSL = projectile(BRIEF);
export const BEAM_SKSL = beam(BRIEF);
export const CONE_SKSL = cone(BRIEF);
export const ARROW_SKSL = arrow(BRIEF);
export const BULLET_SKSL = bullet(BRIEF);
export const BOLT_SKSL = bolt(BRIEF);
export const SLASH_SKSL = slash(BRIEF);
export const BITE_SKSL = bite(BRIEF);
export const METEOR_SKSL = meteor(BRIEF);
export const HEAL_SKSL = heal(BRIEF);
export const TELEPORT_SKSL = teleport;
export const RAIN_SKSL = rain(BRIEF);
export const AURA_SKSL = aura(BRIEF);
export const WALL_SKSL = wall(BRIEF);
export const DOME_SKSL = dome(BRIEF);
export const CUBE_SKSL = cube(BRIEF);
export const CLOUD_SKSL = cloud(BRIEF);
export const TRANSFORMATION_SKSL = transformation(BRIEF);
export const FLAME_SKSL = flame(BRIEF);
export const INVISIBILITY_SKSL = invisibility(BRIEF);

/**
 * États : de petits symboles posés sur un token, lisibles d'un coup d'œil. `radius` est le rayon du
 * token, le haut de sa tête est donc en y = -1 (y descend). Chaque état décrit ses symboles par une
 * distance signée : `shape` garde le plus proche, avec sa teinte (`shade`) et son opacité. Un liseré
 * sombre les détache de n'importe quelle carte ; `glow` ajoute une lueur douce, de couleur `glowColor`.
 * `beat` avance d'une unité toutes les 3 secondes, aussi bien pour l'effet bref que pour le durable.
 */
const SHAPES = `
float dot2(vec2 v) {
  return dot(v, v);
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
// Cœur de hauteur 1, centré, pointe en bas.
float heart(vec2 p) {
  p = vec2(abs(p.x), 0.5 - p.y);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
// Étoile à cinq branches de rayon r, une pointe en haut.
float star(vec2 p, float r) {
  vec2 k1 = vec2(0.809017, -0.587785);
  vec2 k2 = vec2(-k1.x, k1.y);
  p = vec2(abs(p.x), -p.y);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = 0.45 * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
vec2 turned(vec2 p, float a) {
  return vec2(cos(a) * p.x + sin(a) * p.y, cos(a) * p.y - sin(a) * p.x);
}
`;

const condition = (body: string) => (timing: Timing) => `${common(timing, 3)}
uniform float radius;
${SHAPES}
half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 2.0) return half4(0.0);

  float beat = clock();
  float l = life();
  float fade = smoothstep(0.0, 0.15, l) * (1.0 - smoothstep(0.85, 1.0, l));
  float aa = 1.5 / radius;
  vec3 fillColor = mix(palette[1], palette[2], 0.4);
  vec3 glowColor = palette[1];
  float shape = 1000.0;
  float shade = 1.0;
  // 1 : le symbole prend la couleur franche de l'élément au lieu de sa teinte claire.
  float hue = 0.0;
  float opacity = 1.0;
  float glow = 0.0;
${body}
  float fill = 1.0 - smoothstep(-aa, aa, shape);
  float symbol = (1.0 - smoothstep(-aa, aa, shape - 0.035)) * opacity;
  vec3 color = mix(palette[0] * 0.3, clamp(mix(fillColor, palette[1], hue) * shade, 0.0, 1.0), fill);
  float halo = clamp(glow, 0.0, 1.0) * (1.0 - symbol);
  float alpha = (symbol + halo) * fade;
  return half4((color * symbol + glowColor * halo) * fade, alpha);
}
`;

/** Charmé : trois cœurs qui tournent au-dessus de la tête, en battant doucement. */
const charmed = condition(`
  for (int i = 0; i < 3; i++) {
    float a = beat * 6.2832 + float(i) * 2.0944;
    float depth = sin(a);
    vec2 c = vec2(cos(a) * 0.62, -0.95 + depth * 0.16);
    float s = 0.24 * (0.8 + 0.2 * depth) * (1.0 + 0.1 * sin(beat * 25.0 + float(i)));
    float sd = heart((p - c) / s) * s;
    if (sd < shape) { shape = sd; shade = 0.8 + 0.25 * depth; }
  }
  glow = exp(-dot2(vec2((d - 1.0) / 0.12, 0.0))) * 0.25 * (0.6 + 0.4 * sin(beat * 12.0));
`);

/** Endormi : des « Z » qui montent en grandissant, de plus en plus pâles. */
const asleep = condition(`
  for (int i = 0; i < 3; i++) {
    float phase = fract(beat * 0.8 + float(i) / 3.0);
    vec2 c = vec2(0.45 + phase * 0.45 + sin(phase * 9.0 + float(i)) * 0.05, -0.6 - phase * 0.85);
    float s = 0.08 + phase * 0.1;
    vec2 q = (p - c) / s;
    float z = min(min(segment(q, vec2(-0.75, -0.8), vec2(0.75, -0.8)), segment(q, vec2(0.75, -0.8), vec2(-0.75, 0.8))),
      segment(q, vec2(-0.75, 0.8), vec2(0.75, 0.8)));
    float sd = (z - 0.2) * s;
    if (sd < shape) { shape = sd; opacity = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.7, 1.0, phase)); }
  }
  fillColor = mix(palette[2], vec3(1.0), 0.3);
`);

/** Étourdi : des étoiles qui tournent en rond au-dessus de la tête, sur une orbite à peine tracée. */
const dazed = condition(`
  for (int i = 0; i < 4; i++) {
    float a = beat * 8.0 + float(i) * 1.5708;
    float depth = sin(a);
    vec2 c = vec2(cos(a) * 0.55, -0.9 + depth * 0.15);
    float s = 0.14 * (0.8 + 0.2 * depth);
    float sd = star(turned(p - c, beat * 10.0 + float(i)) / s, 1.0) * s;
    if (sd < shape) { shape = sd; shade = 0.8 + 0.3 * depth; }
  }
  float orbit = length((p - vec2(0.0, -0.9)) / vec2(0.55, 0.15));
  glow = exp(-dot2(vec2((orbit - 1.0) / 0.12, 0.0))) * 0.3;
  fillColor = mix(palette[2], vec3(1.0, 0.95, 0.5), 0.35);
`);

/** Effrayé : des traits de frayeur qui tremblent tout autour, et une ombre qui ronge le bord du token. */
const frightened = condition(`
  float jitter = floor(beat * 30.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float a = fi / 9.0 * 6.2832 + (hash(vec2(fi, jitter)) - 0.5) * 0.15;
    float r0 = 1.08 + hash(vec2(fi + 3.0, jitter)) * 0.06;
    float len = 0.17 + 0.07 * sin(beat * 19.0 + fi * 1.7);
    vec2 u = vec2(cos(a), sin(a));
    float sd = segment(p, u * r0, u * (r0 + len)) - 0.03;
    if (sd < shape) { shape = sd; }
  }
  glow = (1.0 - smoothstep(0.85, 1.02, d)) * smoothstep(0.5, 0.95, d) * (0.35 + 0.35 * fbm(p * 5.0 + beat * 6.0));
  glowColor = palette[0] * 0.6;
  fillColor = mix(palette[2], vec3(1.0), 0.2);
`);

/** Paralysé : des arcs électriques qui sautent sur le pourtour du token. */
const paralyzed = condition(`
  float flick = floor(beat * 24.0);
  float ang = atan(p.y, p.x);
  vec2 around = vec2(cos(ang), sin(ang));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float start = hash(vec2(fi, flick)) * 6.2832;
    float span = 0.5 + hash(vec2(fi + 7.0, flick)) * 0.6;
    // Écart d'angle mesuré dans un seul sens : aucune coupure entre -π et π.
    float off = mod(ang - start + 12.5664, 6.2832);
    if (off < span) {
      float r = 1.03 + (noise(around * 6.0 + vec2(fi * 3.1, flick)) - 0.5) * 0.24;
      float sd = abs(d - r) - 0.02 * sin(off / span * 3.1416) - 0.005;
      if (sd < shape) { shape = sd; }
    }
  }
  glow = exp(-dot2(vec2((d - 1.03) / 0.1, 0.0))) * 0.35 * (0.6 + 0.4 * hash(vec2(flick, 1.0)));
  fillColor = mix(palette[2], vec3(1.0), 0.5);
`);

/** Empoisonné : des bulles qui montent au-dessus de la tête et éclatent, sur un teint malade. */
const poisoned = condition(`
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float phase = fract(beat * (0.7 + hash(vec2(fi, 2.0)) * 0.4) + hash(vec2(fi, 5.0)));
    float x = (hash(vec2(fi, 9.0)) - 0.5) * 1.1 + sin(phase * 7.0 + fi) * 0.06;
    vec2 c = vec2(x, -0.45 - phase * 0.9);
    float s = 0.05 + hash(vec2(fi, 4.0)) * 0.05;
    float pop = smoothstep(0.85, 1.0, phase);
    float sd = min(abs(length(p - c) - s * (1.0 + pop)) - 0.014, length(p - c + vec2(0.4, 0.4) * s) - s * 0.22);
    if (sd < shape) { shape = sd; opacity = smoothstep(0.0, 0.1, phase) * (1.0 - pop); }
  }
  glow = (1.0 - smoothstep(0.6, 1.0, d)) * 0.2 * (0.5 + fbm(p * 4.0 - vec2(0.0, beat * 3.0)));
`);

/** Concentration : un cercle de repères qui tourne lentement autour du token. */
const concentrating = condition(`
  float ang = atan(p.y, p.x) + beat * 1.5;
  // Seize repères : le motif se répète un nombre entier de fois, donc sans coupure.
  float sector = 6.2832 / 16.0;
  float k = mod(ang, sector) - sector * 0.5;
  vec2 q = vec2(k * 1.15, d - 1.15);
  float tick = segment(q, vec2(0.0, -0.04), vec2(0.0, 0.04)) - 0.014;
  shape = min(abs(d - 1.05) - 0.012, tick);
  glow = exp(-dot2(vec2((d - 1.05) / 0.08, 0.0))) * 0.3 * (0.7 + 0.3 * sin(beat * 12.0));
`);

/** Ralenti : un sablier au-dessus de la tête, qui se vide puis se retourne, et des ondes molles autour. */
const slowed = condition(`
  // Cycle de 6 secondes : le sable coule, puis le sablier se retourne et tout recommence.
  float cycle = fract(beat * 0.5);
  float poured = smoothstep(0.0, 0.78, cycle);
  float flip = smoothstep(0.8, 1.0, cycle) * 3.1416;
  float s = 0.36;
  vec2 q = turned(p - vec2(0.0, -1.2), flip) / s;
  // Verre : deux barres et deux diagonales qui se croisent au milieu.
  float glass = min(min(segment(q, vec2(-0.55, -1.0), vec2(0.55, -1.0)), segment(q, vec2(-0.55, 1.0), vec2(0.55, 1.0))),
    min(segment(q, vec2(-0.48, -1.0), vec2(0.48, 1.0)), segment(q, vec2(0.48, -1.0), vec2(-0.48, 1.0)))) - 0.06;
  // Sable : ce qui reste en haut, ce qui s'est amassé en bas, et le filet qui tombe entre les deux.
  float cone = (abs(q.x) - 0.4 * abs(q.y)) * 0.93;
  float top = max(cone, max(-0.85 * (1.0 - poured) - q.y, q.y));
  float bottom = max(cone, max(1.0 - 0.85 * poured - q.y, q.y - 0.92));
  float stream = poured < 1.0 && flip == 0.0 ? max(abs(q.x) - 0.035, max(-q.y, q.y - 1.0)) : 1000.0;
  float sand = min(min(top, bottom), stream);
  if (glass * s < shape) { shape = glass * s; shade = 1.15; }
  if (sand * s < shape) { shape = sand * s; shade = 1.0; hue = 1.0; }
  // Ondes lentes qui s'éloignent du token.
  for (int i = 0; i < 3; i++) {
    float phase = fract(beat * 0.35 + float(i) / 3.0);
    float ringOffset = (d - 1.0 - phase * 0.45) / 0.05;
    glow += exp(-ringOffset * ringOffset) * (1.0 - phase) * 0.35;
  }
  fillColor = mix(palette[2], vec3(1.0), 0.25);
`);

const CONDITIONS = {
  charme: charmed,
  sommeil: asleep,
  etourdi: dazed,
  effraye: frightened,
  paralyse: paralyzed,
  empoisonne: poisoned,
  concentration: concentrating,
  ralenti: slowed,
};

const mapConditions = (timing: Timing) =>
  Object.fromEntries(Object.entries(CONDITIONS).map(([id, shader]) => [id, shader(timing)])) as Record<
    keyof typeof CONDITIONS,
    string
  >;

/** Version brève de chaque état. Un objet, pas une chaîne : chaque état a son shader. */
export const CONDITION_SKSL = mapConditions(BRIEF);

/** Version continue de chaque style. */
export const DURABLE_SKSL = {
  pluie: rain(SUSTAINED),
  aura: aura(SUSTAINED),
  invisibilite: invisibility(SUSTAINED),
  ...mapConditions(SUSTAINED),
  mur: wall(SUSTAINED),
  dome: dome(SUSTAINED),
  cube: cube(SUSTAINED),
  nuage: cloud(SUSTAINED),
  transformation: transformation(SUSTAINED),
  flamme: flame(SUSTAINED),
  rayon: beam(SUSTAINED),
  chaine: beam(SUSTAINED),
  cone: cone(SUSTAINED),
  soin: heal(SUSTAINED),
  fleche: arrow(still(1)),
  coup: slash(still(0.45)),
  griffes: slash(still(0.45)),
  morsure: bite(still(0.78)),
  projectile: SCORCH_SKSL,
  tir: SCORCH_SKSL,
  rafale: SCORCH_SKSL,
  blaster: SCORCH_SKSL,
  explosion: SCORCH_SKSL,
  meteore: SCORCH_SKSL,
  teleportation: teleportLoop,
};
