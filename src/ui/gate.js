// Password screen shown before anything else loads. Static hosting can't keep a secret, so this only keeps casual
// visitors out: the password is checked against its SHA-256 hash and remembered on this browser once entered.
const HASH = 'd30e42f298e94b54786cb7c6b3ce5e043a975e4e7ec32e7aac983235d67bc148';
const KEY = 'cc.gate.v1';

function remembered() {
  try { return localStorage.getItem(KEY) === HASH; } catch { return false; }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolves once the visitor has entered the password (immediately if they already have on this browser). */
export function passGate() {
  if (remembered()) return Promise.resolve();
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    app?.classList.add('hidden');
    const el = document.createElement('section');
    el.className = 'pw-gate';
    el.innerHTML = `
      <form class="pw-box" autocomplete="off">
        <div class="pw-kicker">Restricted</div>
        <h1>Enter password</h1>
        <input type="password" class="pw-input" aria-label="Password" autofocus />
        <button type="submit" class="btn primary">Enter</button>
        <p class="pw-err" role="status"></p>
      </form>`;
    document.body.appendChild(el);
    const form = el.querySelector('form'), input = el.querySelector('input'), err = el.querySelector('.pw-err');
    setTimeout(() => input.focus(), 30);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = (await sha256(input.value.trim().toLowerCase())) === HASH;
      if (!ok) {
        err.textContent = 'Wrong password';
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        input.select();
        return;
      }
      try { localStorage.setItem(KEY, HASH); } catch { /* private window: ask again next visit */ }
      el.remove();
      app?.classList.remove('hidden');
      resolve();
    });
  });
}
