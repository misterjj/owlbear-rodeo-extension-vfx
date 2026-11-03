/**
 * Effets calculés par la carte graphique : aucune image à fournir.
 * Écrits en SkSL. `model` est fourni par Owlbear pour les effets « VIEWPORT » : il donne la
 * position sur la carte par rapport à l'objet, qui est donc le centre de l'effet.
 * Les couleurs sont renvoyées prémultipliées par l'opacité, comme l'attend Owlbear.
 */
const NOISE = `
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
vec3 fireRamp(float heat) {
  vec3 color = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.33, 0.02), smoothstep(0.0, 0.4, heat));
  color = mix(color, vec3(1.0, 0.78, 0.2), smoothstep(0.4, 0.75, heat));
  return mix(color, vec3(1.0, 0.97, 0.82), smoothstep(0.75, 1.0, heat));
}
`;

export const EXPLOSION_SKSL = `
uniform mat3 model;
uniform float t;
uniform float radius;
uniform float seed;
${NOISE}
half4 main(float2 coord) {
  vec2 p = (model * vec3(coord, 1.0)).xy / radius;
  float d = length(p);
  if (d > 1.4) return half4(0.0);

  float grow = 1.0 - pow(1.0 - clamp(t / 0.35, 0.0, 1.0), 3.0);
  vec2 outward = p / max(d, 0.001);
  float n = fbm(p * 3.2 - outward * smoothstep(0.0, 0.45, d) * t * 1.6 + seed);

  // Fumée qui reste après la boule de feu.
  float smokeEdge = 1.0 - d / (0.55 + 0.6 * t) + (fbm(p * 2.4 + seed + t * 0.5) - 0.5) * 1.1;
  float smokeAlpha = smoothstep(0.0, 0.45, smokeEdge)
    * smoothstep(0.18, 0.45, t) * (1.0 - smoothstep(0.6, 1.0, t)) * 0.72;
  vec3 color = vec3(0.07, 0.06, 0.06) * smokeAlpha;
  float alpha = smokeAlpha;

  // Boule de feu, qui refroidit en grandissant.
  float body = 1.0 - d / max(grow * 0.92, 0.001) + (n - 0.5) * 1.15;
  float cooling = 1.0 - smoothstep(0.12, 0.72, t);
  float fireAlpha = smoothstep(0.0, 0.16, body) * (1.0 - smoothstep(0.45, 0.82, t));
  vec3 fire = fireRamp(clamp(body * 1.25 * (0.3 + cooling), 0.0, 1.0));
  color = fire * fireAlpha + color * (1.0 - fireAlpha);
  alpha = fireAlpha + alpha * (1.0 - fireAlpha);

  // Onde de choc.
  float ringOffset = (d - grow * 1.22) / 0.035;
  float ring = exp(-ringOffset * ringOffset) * (1.0 - smoothstep(0.05, 0.38, t)) * 0.8;
  // Éclair du tout début.
  float flash = exp(-d * d * 5.0) * (1.0 - smoothstep(0.0, 0.14, t));
  // Étincelles projetées.
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
  color = vec3(1.0, 0.82, 0.45) * glow + color * (1.0 - glow);
  alpha = glow + alpha * (1.0 - glow);
  return half4(color, alpha);
}
`;

export const PROJECTILE_SKSL = `
uniform mat3 model;
uniform float t;
uniform vec2 target;
uniform float width;
uniform float seed;
${NOISE}
half4 main(float2 coord) {
  vec2 p = (model * vec3(coord, 1.0)).xy;
  float len = max(length(target), 1.0);
  vec2 dir = target / len;
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));

  float behind = t * len - along;
  float trailLength = min(len * 0.6, width * 9.0);
  if (behind < -width * 2.5 || behind > trailLength || abs(across) > width * 3.0) {
    return half4(0.0);
  }

  // Tête du projectile.
  float headDistance = length(vec2(behind, across)) / width;
  float head = exp(-headDistance * headDistance * 1.3);

  // Traînée qui s'amincit, déformée par des flammes.
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
  return half4(fireRamp(heat) * alpha, alpha);
}
`;
