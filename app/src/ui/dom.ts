export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n > 1 ? many : one}`;

/** Petites icônes au trait (24 × 24). */
const ICONS: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 21H20"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  flame: '<path d="M12.4 2.5c.6 3.4 4.6 5 4.6 9.8a5 5 0 0 1-10 0c0-1.9.8-3.3 1.8-4.3.2 1.4.9 2.3 1.9 2.7-.3-2.9.3-6.1 1.7-8.2z" fill="currentColor" stroke="none"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  shuffle: '<path d="M4 7h3.5c2 0 3 1 4 2.5l1 2c1 1.5 2 2.5 4 2.5H20M4 17h3.5c1.2 0 2-.4 2.8-1.1M14 8.1c.7-.7 1.5-1.1 2.5-1.1H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/>',
  chev: '<path d="M9 6l6 6-6 6" stroke-width="2"/>',
  back: '<path d="M15 6l-6 6 6 6" stroke-width="2"/>',
  first: '<path d="M18 6l-6 6 6 6M7 6v12" stroke-width="2"/>',
  last: '<path d="M6 6l6 6-6 6M17 6v12" stroke-width="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5" stroke-width="2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6" stroke-width="2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  stack: '<path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5" stroke-width="2"/>',
  pawn: '<circle cx="12" cy="6.5" r="3"/><path d="M9.5 10.5h5l1 6h-7zM6.5 20.5h11l-1.5-4h-8z"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M7.5 15l3.5-4.5 3 2.5 5-6.5" stroke-width="2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
export const icon = (name: string, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
