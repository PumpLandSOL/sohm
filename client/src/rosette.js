// The sOHM hero: a guilloché rosette — the woven line-work engraved on banknotes — drawn live on canvas.
// Two lace bands turn against each other so their lines beat into a moving moiré; the outer arc is the
// rebase clock and the microprint ring carries the live epoch. window.sohmRosette(canvas) -> { set(state) }.
window.sohmRosette = function (cv) {
  const g = cv.getContext('2d'); let W = 0, H = 0, S = 0, cx = 0, cy = 0;
  const small = () => Math.min(innerWidth, innerHeight) < 700;
  const dpr = () => Math.min(small() ? 1.5 : 2, devicePixelRatio || 1);
  const state = { progress: 0, text: 'SOHM · THE (3,3) RESERVE OF SOLANA · STAKE · BOND · COMPOUND · ' };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mx = 0, my = 0, tx = 0, ty = 0, visible = true;
  function fit() { const d = dpr(); W = cv.offsetWidth; H = cv.offsetHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
    S = Math.max(H * 0.6, Math.min(W, H) * 0.62); if (W < 700) S = Math.min(S, W * 0.78); cx = W / 2; cy = H * 0.5; }
  fit(); addEventListener('resize', fit);
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);
  // one woven band: K copies of r = R + amp·sin(nθ + phase_k)·(1 − wob + wob·sin(mθ + t))
  function band(R, amp, n, K, rot, m, wob, t, alpha, lw) {
    const steps = Math.max(360, n * 30); g.lineWidth = lw; g.strokeStyle = 'rgba(155,109,255,' + alpha + ')';
    for (let k = 0; k < K; k++) { const ph = (k / K) * Math.PI * 2; g.beginPath();
      for (let i = 0; i <= steps; i++) { const th = (i / steps) * Math.PI * 2; const env = 1 - wob + wob * Math.sin(m * th + t);
        const r = R + amp * Math.sin(n * th + ph) * env, a = th + rot; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); }
  }
  function ringText(R, t) { const s = state.text, size = Math.max(9, S * 0.021); g.font = '400 ' + size + 'px "DM Mono",monospace'; g.fillStyle = 'rgba(205,184,255,.62)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const adv = size * 0.92, n = Math.floor((Math.PI * 2 * R) / adv), da = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) { const a = i * da + t; g.save(); g.translate(cx + R * Math.cos(a), cy + R * Math.sin(a)); g.rotate(a + Math.PI / 2); g.fillText(s[i % s.length], 0, 0); g.restore(); } }
  const t0 = performance.now();
  function draw(now) {
    if (!still) requestAnimationFrame(draw); if (!visible && !still) return;
    const t = (now - t0) / 1000; mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const K = small() ? 0.55 : 1, breathe = 1 + 0.06 * Math.sin(t * 0.5) + my * 0.25;
    g.clearRect(0, 0, W, H);
    // glow behind the note
    const rg = g.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 1.05); rg.addColorStop(0, 'rgba(120,70,255,.20)'); rg.addColorStop(0.55, 'rgba(90,40,200,.07)'); rg.addColorStop(1, 'rgba(5,3,8,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    band(S * 0.955, S * 0.045, 48, Math.round(8 * K), -t * 0.02, 6, 0.25, t * 0.4, 0.34, 0.6);                    // outer lace
    band(S * 0.70, S * 0.15 * breathe, 12, Math.round(24 * K), t * 0.03 + mx * 0.6, 3, 0.35, t * 0.3, 0.26, 0.6);  // main band
    band(S * 0.70, S * 0.15 * breathe, 13, Math.round(24 * K), -t * 0.03 - mx * 0.6, 4, 0.35, -t * 0.25, 0.22, 0.6); // counter band → moiré
    band(S * 0.36, S * 0.13, 7, Math.round(18 * K), t * 0.05, 2, 0.5, t * 0.6, 0.30, 0.6);                        // inner rosette
    band(S * 0.185, S * 0.022, 30, Math.round(6 * K), -t * 0.08, 5, 0.2, t, 0.4, 0.6);                             // collar
    g.globalCompositeOperation = 'source-over';
    // hairline rings + the rebase clock
    g.lineWidth = 1; g.strokeStyle = 'rgba(155,109,255,.28)'; [0.895, 1.012, 1.075].forEach((r) => { g.beginPath(); g.arc(cx, cy, S * r, 0, Math.PI * 2); g.stroke(); });
    g.lineWidth = 2; g.strokeStyle = '#e6d9ff'; g.shadowColor = '#9b6dff'; g.shadowBlur = 16; g.beginPath(); g.arc(cx, cy, S * 1.012, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.progress); g.stroke(); g.shadowBlur = 0;
    ringText(S * 1.044, -t * 0.02);
    // dark well so the wordmark reads
    const well = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.5); well.addColorStop(0, 'rgba(5,3,8,.82)'); well.addColorStop(0.6, 'rgba(5,3,8,.45)'); well.addColorStop(1, 'rgba(5,3,8,0)'); g.fillStyle = well; g.beginPath(); g.arc(cx, cy, S * 0.5, 0, Math.PI * 2); g.fill();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => still && draw(performance.now()));
  draw(performance.now());
  return { set(o) { Object.assign(state, o); } };
};
