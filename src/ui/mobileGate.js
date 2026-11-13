// Phones / tablets get a "continue on desktop" screen and never load the 3D world.
export function isMobileDevice() {
  const q = new URLSearchParams(location.search);
  if (q.has('desktop')) return false;
  if (q.has('mobile')) return true;
  const ua = navigator.userAgent || '';
  const uaMobile = navigator.userAgentData?.mobile === true || /Android|iPhone|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini/i.test(ua);
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1 && !matchMedia('(any-pointer: fine)').matches;
  const coarseOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  const tablet = /iPad|Tablet/i.test(ua);
  const smallScreen = Math.min(screen.width, screen.height) < 500 && !matchMedia('(any-pointer: fine)').matches;
  return uaMobile || iPadOS || tablet || coarseOnly || smallScreen;
}

export function showMobileGate() {
  document.getElementById('app')?.classList.add('hidden');
  const url = location.href.split('#')[0];
  const el = document.createElement('section');
  el.className = 'mobile-gate';
  el.innerHTML = `
    <div class="mg-bg"></div>
    <div class="mg-box">
      <div class="mg-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="21"/><path d="M32 4v16M32 44v16M4 32h16M44 32h16"/><circle cx="32" cy="32" r="3" class="dot"/></svg></div>
      <div class="mg-kicker">Campus Operations</div>
      <h1>Hinsdale Central <span>FFA</span></h1>
      <p class="mg-lead">Please continue on desktop</p>
      <p class="mg-sub">This game needs a keyboard and mouse. Open this link on a laptop or desktop computer:</p>
      <div class="mg-url"><code></code><button type="button">Copy link</button></div>
      <p class="mg-note" role="status"></p>
    </div>`;
  el.querySelector('code').textContent = url;
  const note = el.querySelector('.mg-note');
  el.querySelector('button').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); note.textContent = 'Link copied'; }
    catch {
      const r = document.createRange();
      r.selectNodeContents(el.querySelector('code'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      note.textContent = 'Select and copy the link above';
    }
  });
  document.body.appendChild(el);
}
