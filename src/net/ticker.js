// Interval timer that keeps firing while the tab is hidden: dedicated-Worker timers are not throttled the way
// main-thread setInterval / requestAnimationFrame are in background tabs (Chrome clamps those to 1 Hz, then to once a
// minute after 5 minutes). Used for the host's authority tick, heartbeats and 20 Hz movement-state sends.
let worker = null;
const subs = new Map();
let nextId = 1;

function ensureWorker() {
  if (worker !== null) return worker;
  try {
    const src = 'const t=new Map();onmessage=(e)=>{const d=e.data;if(d.op==="start"){t.set(d.id,setInterval(()=>postMessage(d.id),d.ms));}else{clearInterval(t.get(d.id));t.delete(d.id);}};';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => subs.get(e.data)?.();
  } catch { worker = false; }
  return worker;
}

/** Calls fn every `ms` milliseconds (also in background tabs). Returns a stop() function. Errors are contained. */
export function every(ms, fn) {
  const safe = () => { try { fn(); } catch (err) { console.error('[ticker]', err); } };
  const w = ensureWorker();
  if (w) {
    const id = nextId++;
    subs.set(id, safe);
    w.postMessage({ op: 'start', id, ms });
    return () => { subs.delete(id); w.postMessage({ op: 'stop', id }); };
  }
  const h = setInterval(safe, ms);
  return () => clearInterval(h);
}
