// Alexander Hamilton High School ("Hami"), Los Angeles: the Yankees, green and white (mascot "Alex", a colonial figure
// in a tricorn hat). The emblem is an original drawing in that spirit: a tricorn over a slab "H" on a dark-green tile.
const GREEN = '#1f9d55';

export const HAMILTON_BRAND = {
  short: 'HAMI',
  brand: { red: GREEN, accent: '#1a8a4a', accent2: '#46d184', theme: 'hamilton' },
  teams: { red: 'Yankees', blue: 'Dolphins' },   // Hamilton vs its Western League rival, Palisades Charter High
  letters: { red: 'H', blue: 'P' },
  // 100 x 112 viewBox
  emblem: `<rect x="1.5" y="1.5" width="97" height="109" rx="5" fill="#08130d" stroke="${GREEN}" stroke-width="3"/>
    <path d="M24 36h15v14h22V36h15v40H61V62H39v14H24z" fill="${GREEN}" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M30 27c4-12 13-17 20-17s16 5 20 17c-7-3-13-4-20-4s-13 1-20 4z" fill="#ffffff"/>
    <path d="M12 29c12-9 25-12 38-12s26 3 38 12c-13 5-25 7-38 7s-25-2-38-7z" fill="#ffffff"/>
    <path d="M17 29c11-5 22-7 33-7s22 2 33 7c-11 3-22 4-33 4s-22-1-33-4z" fill="#0d2417"/>
    <path d="M50 12.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="${GREEN}"/>
    <text x="50" y="93" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="12.6" letter-spacing="1.6" fill="#fff">HAMILTON</text>
    <text x="50.5" y="105" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="8.8" letter-spacing="2.6" fill="${GREEN}">YANKEES</text>`,
};
