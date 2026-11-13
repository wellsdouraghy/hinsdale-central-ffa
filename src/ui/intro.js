// Studio-style intro card ("Prepared for ... only"). Plays over whatever is loading underneath; never blocks.
// Click or any key skips. prefers-reduced-motion: a plain fade.
const TEXT = 'Prepared for the Bigger Penis group chat only';
const TOTAL_MS = 2600;
let current = null;

export function playIntro() {
  if (current) return current.promise;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'intro-card' + (reduced ? ' reduced' : '');
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<div class="intro-scan"></div><div class="intro-line"><span class="intro-rule"></span><span class="intro-text"></span><span class="intro-rule"></span></div>`;
  el.querySelector('.intro-text').textContent = TEXT;
  document.body.appendChild(el);
  let done;
  const promise = new Promise((r) => { done = r; });
  const finish = () => {
    if (!current) return;
    current = null;
    removeEventListener('keydown', skip, true);
    el.removeEventListener('pointerdown', skip);
    el.classList.add('out');
    setTimeout(() => { el.remove(); done(); }, 350);
  };
  const skip = () => finish();
  addEventListener('keydown', skip, true);
  el.addEventListener('pointerdown', skip);
  const timer = setTimeout(finish, TOTAL_MS);
  current = { promise, finish: () => { clearTimeout(timer); finish(); } };
  return promise;
}
