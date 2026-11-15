// Marin Academy branding from ma.org: red #be2828, near-black #0a0b09 and white, with cyan / orange / lime accents;
// the identity is a triangle-faceted "M" over a wide-tracked "MARIN ACADEMY" wordmark. Spread into campus.js.
const RED = '#be2828';

export const MARIN_BRAND = {
  short: 'MA',
  brand: { red: RED, accent: '#b02424', accent2: '#d64242', theme: 'marin' },
  teams: { red: 'Wildcats', blue: 'Panthers' },   // Marin Academy vs its main rival, San Domenico
  letters: { red: 'M', blue: 'S' },
  // 100 x 112 viewBox: black tile, faceted M in the school palette, MARIN / ACADEMY lettering.
  emblem: `<rect x="1.5" y="1.5" width="97" height="109" rx="5" fill="#0a0b09" stroke="#be2828" stroke-width="3"/><path d="M31.0 10 L21.5 41.0 L40.5 41.0 Z" fill="#00bbdc"/><path d="M21.5 41.0 L12 72 L31.0 72.0 Z" fill="#be2828"/><path d="M21.5 41.0 L40.5 41.0 L31.0 72.0 Z" fill="#e87722"/><path d="M40.5 41.0 L31.0 72.0 L50.0 72 Z" fill="#be2828"/><path d="M69.0 10 L59.5 41.0 L78.5 41.0 Z" fill="#be2828"/><path d="M59.5 41.0 L50.0 72 L69.0 72.0 Z" fill="#b5bd00"/><path d="M59.5 41.0 L78.5 41.0 L69.0 72.0 Z" fill="#be2828"/><path d="M78.5 41.0 L69.0 72.0 L88 72 Z" fill="#00bbdc"/><path d="M40.5 41.0 L59.5 41.0 L50.0 72 Z" fill="#ffffff"/><text x="50" y="92" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="14.5" letter-spacing="2.6" fill="#fff">MARIN</text><text x="50.5" y="104.5" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="8.6" letter-spacing="2.3" fill="#be2828">ACADEMY</text>`,
};
