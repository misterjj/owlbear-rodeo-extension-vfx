import type { StyleId } from "./fx";

/** Pictogramme de chaque style, à tracer en 24 × 24 avec un simple contour. */
export const STYLE_ICONS: Record<StyleId, string> = {
  coup: '<path d="M4 20 19 5"/><path d="M15 4h5v5"/><path d="M4 15l5 5"/>',
  griffes: '<path d="M7 3c1.5 6 .5 12-3 18"/><path d="M13 3c1.5 6 .5 12-3 18"/><path d="M19 3c1.5 6 .5 12-3 18"/>',
  morsure: '<path d="M3 7h18l-3 6-3-4-3 6-3-6-3 4z"/><path d="M6 19h12"/>',
  fleche: '<path d="M4 20 20 4"/><path d="M13 4h7v7"/><path d="M4 16v4h4"/>',
  tir: '<path d="M3 9h12v4H9l-1 6H5l1-6H3z"/><path d="M15 10h2M19 8.5l2-1M19 11h3M19 13.5l2 1"/>',
  rafale: '<path d="M3 5h6l2 1.5L9 8H3z"/><path d="M7 11h6l2 1.5-2 1.5H7z"/><path d="M11 17h6l2 1.5-2 1.5h-6z"/>',
  blaster: '<path d="M3 21l5-5M10 14l5-5"/><path d="M18.5 2.5v3M18.5 8.5v3M14 7h3M20 7h3"/>',
  projectile: '<circle cx="16" cy="8" r="4"/><path d="M12 12l-8 8M9 9l-5 5M15 15l-5 5"/>',
  rayon: '<path d="M3 12h18"/><path d="M3 8h13M3 16h13"/>',
  chaine: '<path d="M3 6l6 5-3 3 6 5-2-6 4-2-2-6 8 5"/>',
  cone: '<path d="M3 12 20 4c1.5 5 1.5 11 0 16z"/>',
  explosion: '<path d="m12 2 2 6 6-2-3 6 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-6 6 2z"/>',
  meteore: '<circle cx="8" cy="16" r="4.5"/><path d="M12 12 21 3M8.5 10 15 3.5M14 15.5 20.5 9"/>',
  pluie: '<path d="M7 3l-2 5M14 3l-2 5M20 4l-2 5M9 10l-2 5M16 10l-2 5M5 16l-2 5M12 16l-2 5M19 15l-2 5"/>',
  mur: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 12h18M9 5v7M15 12v7"/>',
  dome: '<path d="M3 18a9 9 0 0 1 18 0z"/><path d="M8 11c1-1.5 2.5-2 4-2"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  nuage: '<path d="M7 19a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4.8 4.8 0 0 1 17.5 19z"/>',
  flamme: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  aura: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="9" stroke-dasharray="3.5 3"/>',
  charme: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  sommeil: '<path d="M4 12h6l-6 7h6"/><path d="M13 4h7l-7 8h7"/>',
  etourdi: '<ellipse cx="12" cy="9" rx="9" ry="3.5" stroke-dasharray="2.5 2"/><path d="m12 13 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z"/>',
  effraye: '<circle cx="12" cy="13" r="5"/><path d="M12 3v3M4.5 6l2 2M19.5 6l-2 2M2.5 13h3M18.5 13h3"/>',
  paralyse: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M13 5l-4 7h5l-3 7"/>',
  empoisonne: '<circle cx="8" cy="15" r="3.5"/><circle cx="15" cy="8" r="2.5"/><circle cx="17.5" cy="16.5" r="1.8"/>',
  concentration: '<circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  ralenti: '<path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9"/>',
  invisibilite: '<path d="M7 20v-9a5 5 0 0 1 10 0v9l-2.5-2-2.5 2-2.5-2z" stroke-dasharray="2.5 2"/><path d="M10 11h.01M14 11h.01"/>',
  soin: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  transformation: '<path d="M12 2c1 4 7 7 7 13a7 7 0 0 1-14 0c0-3 2-5 3-7 1 1 2 2 4-6z"/><path d="M12 13c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 3-5z"/>',
  teleportation: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="7" r="3"/><path d="M8 13c1-4 3-6 6-7" stroke-dasharray="2 2.5"/><path d="M16 11c-1 4-3 6-6 7" stroke-dasharray="2 2.5"/>',
};

export const styleIcon = (style: StyleId) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${STYLE_ICONS[style]}</svg>`;
