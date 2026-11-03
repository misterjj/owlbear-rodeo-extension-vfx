/**
 * Effets calculés par la carte graphique : aucune image à fournir.
 * Écrits en SkSL. `model` est fourni par Owlbear pour les effets « VIEWPORT » : il donne la
 * position sur la carte par rapport à l'objet, qui est donc l'origine de l'effet.
 * Les couleurs sont renvoyées prémultipliées par l'opacité, comme l'attend Owlbear.
 *
 * `palette` contient les couleurs de l'élément : froide, moyenne, chaude.
 */
const COMMON = `
uniform mat3 model;
uniform mat3 palette;
uniform float t;
uniform float seed;
uniform float warp;
uniform float unit;

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
vec2 local(float2 coord) {
  vec2 p = (model * vec3(coord, 1.0)).xy;
  if (warp > 0.0) {
    // Ondulation exprimée en cases, pour rester la même quelle que soit la grille.
    vec2 q = p / unit;
    p += warp * unit * 0.09 * vec2(sin(q.y * 4.5 + t * 16.0 + seed), sin(q.x * 4.5 + t * 16.0 + seed));
  }
  return p;
}
`;

export const EXPLOSION_SKSL = `${COMMON}
uniform vec3 smoke;
uniform float radius;
uniform float rough;
uniform float shock;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.4) return half4(0.0);

  float grow = 1.0 - pow(1.0 - clamp(t / 0.35, 0.0, 1.0), 3.0);
  vec2 outward = p / max(d, 0.001);
  float n = fbm(p * 3.2 * rough - outward * smoothstep(0.0, 0.45, d) * t * 1.6 + seed);

  // Nuage qui reste après l'explosion.
  float smokeEdge = 1.0 - d / (0.55 + 0.6 * t) + (fbm(p * 2.4 + seed + t * 0.5) - 0.5) * 1.1;
  float smokeAlpha = smoothstep(0.0, 0.45, smokeEdge)
    * smoothstep(0.18, 0.45, t) * (1.0 - smoothstep(0.6, 1.0, t)) * 0.72;
  vec3 color = smoke * smokeAlpha;
  float alpha = smokeAlpha;

  // Boule d'énergie, qui s'éteint en grandissant.
  float body = 1.0 - d / max(grow * 0.92, 0.001) + (n - 0.5) * 1.15;
  float cooling = 1.0 - smoothstep(0.12, 0.72, t);
  float bodyAlpha = smoothstep(0.0, 0.16, body) * (1.0 - smoothstep(0.45, 0.82, t)) * (1.0 - shock * 0.85);
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
  sparks *= 1.0 - smoothstep(0.35, 0.8, t);

  float glow = clamp(ring + flash + sparks, 0.0, 1.0);
  color = palette[2] * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  return half4(color, alpha);
}
`;

export const PROJECTILE_SKSL = `${COMMON}
uniform vec2 target;
uniform float width;

half4 main(float2 coord) {
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

export const RAIN_SKSL = `${COMMON}
uniform float radius;
uniform float stretch;
uniform float fallSpeed;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.2) return half4(0.0);

  float fade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.78, 1.0, t));
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
    vec2 q = p * cells + vec2(l * 3.7 + seed, -t * fallSpeed * (5.0 + l));
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
    float phase = fract(t * 3.0 + hash(vec2(index, 8.7)));
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

export const BEAM_SKSL = `${COMMON}
uniform vec2 target;
uniform float width;
uniform float jag;

half4 main(float2 coord) {
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
  float jitter = floor(t * 18.0) * (0.2 + jag * 0.8);
  float wobble = (fbm(vec2(along / width * (0.12 + jag * 0.12) + seed, jitter)) - 0.5) * width * (1.2 + jag * 8.0);
  float a = abs(across - wobble * ends) / width;

  float core = exp(-a * a * 2.4);
  float halo = exp(-a * a * 0.25) * 0.42;
  float tip = 1.0 - smoothstep(reach - width, reach + width, along);
  float start = smoothstep(-width * 1.5, 0.0, along);

  // Éclat aux deux extrémités.
  vec2 toTarget = p - target;
  float hit = smoothstep(0.75, 1.0, reach / len) * exp(-dot(toTarget, toTarget) / (width * width * 5.0));
  float muzzle = exp(-dot(p, p) / (width * width * 3.0));

  float heat = clamp(((core + halo) * tip * start + hit + muzzle * 0.45) * fade, 0.0, 1.0);
  float alpha = smoothstep(0.02, 0.45, heat);
  return half4(ramp(heat) * alpha, alpha);
}
`;

export const CONE_SKSL = `${COMMON}
uniform vec2 target;
uniform vec3 smoke;
uniform float rough;

half4 main(float2 coord) {
  vec2 p = local(coord);
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float r = length(p);
  if (r > len * 1.2 || along < -len * 0.1) return half4(0.0);

  float angle = atan(across, along);
  float reach = max((1.0 - pow(1.0 - clamp(t / 0.4, 0.0, 1.0), 2.0)) * len, 1.0);
  float n = fbm(vec2(r / len * 5.0 * rough - t * 6.0 + seed, angle * 3.0 * rough));

  // Le cône s'ouvre à partir du lanceur, avec un bord irrégulier.
  float edge = 1.0 - abs(angle) / 0.56 + (n - 0.5) * 0.7 * smoothstep(0.0, 0.3, r / len);
  float front = 1.0 - r / reach + (n - 0.5) * 0.65;
  float mask = smoothstep(0.0, 0.42, edge) * smoothstep(0.0, 0.2, front) * smoothstep(0.0, 0.05, r / len);

  float fade = 1.0 - smoothstep(0.5, 1.0, t);
  float heat = clamp((1.0 - r / len + (n - 0.5) * 0.95) * 1.15 * (0.35 + fade * 0.65) + 0.08, 0.0, 1.0);
  float bodyAlpha = mask * fade;

  // Nuage qui traîne quand le souffle s'éteint.
  float smokeAlpha = mask * smoothstep(0.25, 0.55, t) * (1.0 - smoothstep(0.65, 1.0, t)) * 0.55
    * smoothstep(0.32, 0.6, fbm(vec2(r / len * 3.0 + seed, angle * 2.0 + t)));
  vec3 color = smoke * smokeAlpha;
  float alpha = smokeAlpha;
  color = ramp(heat) * bodyAlpha + color * (1.0 - bodyAlpha);
  alpha = bodyAlpha + alpha * (1.0 - bodyAlpha);
  return half4(color, alpha);
}
`;

export const AURA_SKSL = `${COMMON}
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.9) return half4(0.0);

  float fade = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.65, 1.0, t));
  float angle = atan(p.y, p.x);

  // Cercle au sol, parcouru par une énergie qui tourne.
  float swirl = fbm(vec2(angle * 2.0 + t * 5.0 + seed, d * 4.0 - t * 3.0));
  float ringOffset = (d - 0.88 - (swirl - 0.5) * 0.1) / 0.085;
  float ring = exp(-ringOffset * ringOffset);
  float inside = (1.0 - smoothstep(0.1, 0.95, d)) * (0.08 + fbm(p * 3.0 + seed - t) * 0.4);

  // Particules qui montent.
  float motes = 0.0;
  for (int i = 0; i < 26; i++) {
    float index = float(i) + seed;
    float a = hash(vec2(index, 3.3)) * 6.2832;
    float distance = 0.25 + hash(vec2(index, 6.1)) * 0.68;
    float phase = fract(t * 1.6 + hash(vec2(index, 9.2)));
    vec2 mote = vec2(cos(a) * distance, sin(a) * distance * 0.8 - phase * 0.9);
    vec2 offset = p - mote;
    motes += exp(-dot(offset, offset) * 900.0) * (1.0 - phase) * smoothstep(0.0, 0.15, phase);
  }

  float heat = clamp(ring * 0.9 + inside + motes * 1.2, 0.0, 1.0) * fade;
  float alpha = smoothstep(0.0, 0.5, heat);
  return half4(ramp(0.25 + heat * 0.75) * alpha, alpha);
}
`;

export const ARROW_SKSL = `${COMMON}
uniform vec2 target;
uniform float width;

half4 main(float2 coord) {
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

export const SLASH_SKSL = `${COMMON}
uniform float radius;
uniform float claws;

half4 main(float2 coord) {
  vec2 raw = local(coord) / radius;
  if (length(raw) > 1.5) return half4(0.0);

  // La graine donne le sens du coup, identique chez tous les joueurs.
  float angle = hash(vec2(seed, 4.4)) * 6.2832;
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

  float fade = 1.0 - smoothstep(0.5, 1.0, t);
  float heat = clamp(cut + edge * 0.7 + sparks, 0.0, 1.0) * fade;
  float alpha = clamp(cut * fade + smoothstep(0.0, 0.7, edge * fade) + sparks * fade, 0.0, 1.0);
  return half4(ramp(0.25 + heat * 0.75) * alpha, alpha);
}
`;

export const BITE_SKSL = `${COMMON}
uniform float radius;

half4 main(float2 coord) {
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

export const HEAL_SKSL = `${COMMON}
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.9) return half4(0.0);

  float fade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.7, 1.0, t));
  float pulse = 0.75 + 0.25 * sin(t * 14.0);
  float glow = exp(-d * d * 2.2) * 0.42 * pulse;

  // Petites croix lumineuses qui montent.
  float crosses = 0.0;
  for (int i = 0; i < 14; i++) {
    float index = float(i) + seed;
    float x = (hash(vec2(index, 1.9)) - 0.5) * 1.7;
    float y = (hash(vec2(index, 3.7)) - 0.5) * 1.1;
    float phase = fract(t * 1.3 + hash(vec2(index, 6.3)));
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

export const TELEPORT_SKSL = `${COMMON}
uniform float radius;
uniform float appear;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float d = length(p);
  if (d > 1.5) return half4(0.0);

  // Départ : tout converge vers le centre. Arrivée : tout en repart.
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

export const WALL_SKSL = `${COMMON}
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
  float reach = smoothstep(0.0, 0.22, t) * len;
  float over = along - clamp(along, 0.0, reach);
  float d = length(vec2(over, across)) / width;
  if (d > 2.2) return half4(0.0);

  float n = fbm(vec2(along / width * 0.55 * rough + seed, across / width * 0.5 - t * 9.0));
  float sink = 1.0 - smoothstep(0.76, 1.0, t);
  float body = (1.0 - d + (n - 0.5) * 1.3) * sink;
  float alpha = smoothstep(0.0, 0.22, body) * smoothstep(0.0, 0.05, t);
  float heat = clamp(body * 1.5 + 0.05, 0.0, 1.0);
  return half4(ramp(heat) * alpha, alpha);
}
`;

export const DOME_SKSL = `${COMMON}
uniform float radius;

half4 main(float2 coord) {
  vec2 p = local(coord) / radius;
  float raw = length(p);
  if (raw > 1.15) return half4(0.0);

  // La bulle s'ouvre, tient, puis se referme sur elle-même.
  float open = 1.0 - pow(1.0 - clamp(t / 0.22, 0.0, 1.0), 3.0);
  float close = smoothstep(0.82, 1.0, t);
  float size = max(open * (1.0 - close * 0.25), 0.001);
  float d = raw / size;
  if (d > 1.06) return half4(0.0);

  // Plus dense sur le bord, comme une sphère vue de haut.
  float rim = pow(clamp(d, 0.0, 1.0), 5.0);
  float n = fbm(p * 4.0 + vec2(seed, t * 3.0));
  float veil = 0.1 + smoothstep(0.42, 0.72, n) * 0.22;
  vec2 sheenOffset = p - vec2(-0.36, -0.42) * size;
  float sheen = exp(-dot(sheenOffset, sheenOffset) * 9.0) * 0.3;

  // Vague qui parcourt la bulle à l'ouverture.
  float waveOffset = (d - clamp(t / 0.35, 0.0, 1.0)) / 0.09;
  float wave = exp(-waveOffset * waveOffset) * (1.0 - smoothstep(0.2, 0.4, t)) * 0.6;

  float edge = 1.0 - smoothstep(1.0, 1.06, d);
  float fade = 1.0 - close;
  float heat = clamp(rim + wave + sheen, 0.0, 1.0);
  float alpha = clamp(rim * 0.95 + veil + wave + sheen, 0.0, 1.0) * edge * fade;
  return half4(ramp(0.3 + heat * 0.7) * alpha, alpha);
}
`;
