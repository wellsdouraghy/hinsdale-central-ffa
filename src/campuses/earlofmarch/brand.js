// Earl of March Secondary School branding. Colours: green, white, gold and black (Wikipedia infobox, the school's
// crest); the teams are the Lions ("Home of the Lions!": earlofmarchss.ocdsb.ca athletics page). The emblem is an
// original drawing in that spirit: a gold lion's head (mane, brow, muzzle) on a dark-green shield with EARL OF MARCH / LIONS lettering.
// Teams: Lions (home) vs Jays = A.Y. Jackson Secondary School, the other English public high school in Kanata (blue and
// white, mascot a blue jay). No source names an official rival; A.Y. Jackson is the same-board, same-suburb,
// same-league (NCSSAA) neighbour that was split off from Earl of March's catchment in 1976. Spread into campus.js.
const GREEN = '#0b6b3a', GOLD = '#f2b632';

export const EOM_BRAND = {
  short: 'EOM',
  brand: { red: GREEN, accent: '#0f8a4a', accent2: '#f2b632', theme: 'earlofmarch' },
  teams: { red: 'Lions', blue: 'Jays' },
  letters: { red: 'E', blue: 'J' },
  // 100 x 112 viewBox
  emblem: `<path d="M6 4 H94 V62 C94 86 74 100 50 109 C26 100 6 86 6 62 Z" fill="#0a2c1a" stroke="${GOLD}" stroke-width="4"/>`
    + `<path d="M50 24 L61 20 L64 29 L74 28 L73 38 L82 42 L76 50 L81 59 L72 62 L71 72 L61 71 L56 80 L50 74 L44 80 L39 71 L29 72 L28 62 L19 59 L24 50 L18 42 L27 38 L26 28 L36 29 L39 20 Z" fill="${GOLD}"/>`
    + `<path d="M50 34 L61 38 L66 50 L61 63 L55 70 L45 70 L39 63 L34 50 L39 38 Z" fill="#0a2c1a"/>`
    + `<path d="M40 46 L47 49 L45.5 53 L40.5 51.5 Z" fill="${GOLD}"/><path d="M60 46 L53 49 L54.5 53 L59.5 51.5 Z" fill="${GOLD}"/>`
    + `<path d="M46 57 L54 57 L52 62 L50 63.5 L48 62 Z" fill="${GOLD}"/><path d="M50 63.5 L50 66.5 M44.5 67.5 C47 69.5 49 68.5 50 66.5 C51 68.5 53 69.5 55.5 67.5" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/>`
    + `<text x="50" y="16" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="7.6" letter-spacing="1.3" fill="#ffffff">EARL OF MARCH</text>`
    + `<text x="50" y="94" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="9" letter-spacing="2.6" fill="${GOLD}">LIONS</text>`,
};
