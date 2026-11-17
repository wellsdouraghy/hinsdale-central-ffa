// The Branson School branding (branson.org): blue #0055B8 and green #00953B on white; the athletic teams are the Bulls.
// Teams: Bulls (home) vs Wildcats (Marin Academy, the rival the Marin IJ names and the user confirmed). Spread into campus.js.
const BLUE = '#0055b8', GREEN = '#00953b';

export const BRANSON_BRAND = {
  short: 'BR',
  brand: { red: BLUE, accent: '#0055b8', accent2: '#2f86e6', theme: 'branson' },
  teams: { red: 'Bulls', blue: 'Wildcats' },
  letters: { red: 'B', blue: 'M' },
  // 100 x 112 viewBox: white shield edged in blue, a bull's head (horns, brow, muzzle) in blue with green eyes, BRANSON / BULLS lettering.
  emblem: `<path d="M6 4 H94 V62 C94 86 74 100 50 109 C26 100 6 86 6 62 Z" fill="#ffffff" stroke="${BLUE}" stroke-width="4"/>`
    + `<path d="M18 22 C14 34 22 44 34 44 L38 37 C30 37 24 31 26 22 Z" fill="${BLUE}"/><path d="M82 22 C86 34 78 44 66 44 L62 37 C70 37 76 31 74 22 Z" fill="${BLUE}"/>`
    + `<path d="M32 38 L68 38 L72 50 L63 72 L56 80 L44 80 L37 72 L28 50 Z" fill="${BLUE}"/><path d="M41 68 L59 68 L56 78 L44 78 Z" fill="#ffffff"/><circle cx="46.5" cy="73" r="1.8" fill="${BLUE}"/><circle cx="53.5" cy="73" r="1.8" fill="${BLUE}"/>`
    + `<path d="M37 50 L46 53 L44 58 L38 56 Z" fill="${GREEN}"/><path d="M63 50 L54 53 L56 58 L62 56 Z" fill="${GREEN}"/>`
    + `<text x="50" y="16.5" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="10.5" letter-spacing="2.2" fill="${BLUE}">BRANSON</text>`
    + `<text x="50" y="94" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="9" letter-spacing="2.4" fill="${GREEN}">BULLS</text>`,
};
