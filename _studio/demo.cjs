// Real screen recording of the live sOHM site: landing, dashboard, wallet sign-in, a bond quote, staking, the calculator.
//   node _studio/demo.cjs [base url]        default https://solanaohm.xyz
// Headless Chrome has no Phantom extension, so a stand-in wallet with Phantom's interface is injected: a fresh ed25519
// key made in the page, which signs the real session message (the live server verifies that signature). It holds no
// funds and sends nothing; the recording stops at the bond quote and never presses Bond.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { open, sleep } = require('./cdp-rec.cjs');
const BASE = (process.argv[2] || 'https://solanaohm.xyz').replace(/\/$/, ''), OUT = path.join(__dirname, '..', 'brand', 'sohm-app-demo.mp4'), FR = path.join(__dirname, 'frames-demo');
const BOOT = `(() => {
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = (bytes) => { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let o = ''; while (n > 0n) { o = B58[Number(n % 58n)] + o; n /= 58n; } for (const b of bytes) { if (b === 0) o = '1' + o; else break; } return o; };
  const ready = crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']).then(async (kp) => ({ kp, raw: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) }));
  const pk = (raw) => ({ toString: () => b58(raw), toBytes: () => raw });
  const w = { isPhantom: true, publicKey: null, on() {}, async connect(o) { if (o && o.onlyIfTrusted) throw new Error('not trusted'); const { raw } = await ready; w.publicKey = pk(raw); return { publicKey: w.publicKey }; }, async disconnect() { w.publicKey = null; },
    async signMessage(m) { const { kp } = await ready; return { signature: new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, m)) }; }, async request() { throw new Error('this recording sends no transactions'); } };
  window.phantom = { solana: w };
  const ui = () => { if (document.getElementById('dm-cur')) return; const s = document.createElement('style');
    s.textContent = '#dm-cur{position:fixed;left:640px;top:380px;z-index:99999;pointer-events:none;transition:left .7s cubic-bezier(.3,.7,.2,1),top .7s cubic-bezier(.3,.7,.2,1)}#dm-rip{position:fixed;z-index:99998;width:16px;height:16px;border-radius:50%;border:2px solid #cdb8ff;pointer-events:none;opacity:0}#dm-rip.go{animation:dmr .5s ease-out}@keyframes dmr{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(3.2)}}#dm-cap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99997;pointer-events:none;background:rgba(8,5,14,.94);border:1px solid rgba(155,109,255,.7);color:#f2edfc;font:italic 500 19px Fraunces,Georgia,serif;padding:11px 24px;border-radius:999px;box-shadow:0 12px 50px rgba(120,70,255,.45);white-space:nowrap;transition:opacity .3s;opacity:0}.toast{bottom:84px!important}';
    document.head.appendChild(s); const c = document.createElement('div'); c.id = 'dm-cur'; c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 8z" fill="#fff" stroke="#0a0714" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = 'dm-rip'; const p = document.createElement('div'); p.id = 'dm-cap'; document.body.append(c, r, p);
    const pos = (el) => { const b = el.getBoundingClientRect(); return [b.left + Math.min(b.width * .5, 200), b.top + b.height * .5]; };
    window.dmCap = (t) => { p.textContent = t; p.style.opacity = t ? 1 : 0; };
    window.dmTo = (el) => { const [x, y] = pos(el); c.style.left = x + 'px'; c.style.top = y + 'px'; };
    window.dmClick = (el) => { const [x, y] = pos(el); r.style.left = (x - 8) + 'px'; r.style.top = (y - 8) + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); el.click(); };
    window.dmType = async (el, text, gap) => { el.focus(); el.value = ''; for (const ch of text) { el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((z) => setTimeout(z, gap || 170)); } };
    window.dmSlide = async (el, to, ms) => { const from = +el.value, n = 26; for (let i = 1; i <= n; i++) { el.value = Math.round(from + (to - from) * i / n); el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((z) => setTimeout(z, (ms || 1600) / n)); } }; };
  if (document.body) ui(); else addEventListener('DOMContentLoaded', ui);
})()`;

(async () => {
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const c = await open('about:blank', 1280, 720, 9373);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  const wait = async (expr, ms = 20000) => { const e = Date.now() + ms; while (Date.now() < e) { if (await c.ev(expr).catch(() => 0)) return true; await sleep(150); } return false; };
  const cap = (t) => c.ev('dmCap(' + JSON.stringify(t) + ')'), q = (sel) => 'document.querySelector(' + JSON.stringify(sel) + ')';
  const go = async (sel, pause = 1000) => { await c.ev('dmTo(' + q(sel) + ')'); await sleep(pause); await c.ev('dmClick(' + q(sel) + ')'); };
  await c.send('Page.navigate', { url: BASE + '/' });
  if (!(await wait('document.readyState==="complete"&&document.getElementById("tApy")&&document.getElementById("tApy").textContent!=="—"'))) throw new Error('landing did not load');
  await c.ev('document.fonts.ready.then(()=>1)'); await sleep(1200);
  let n = 0; const t0 = Date.now(), stamps = [];
  c.on('Page.screencastFrame', (p) => { fs.writeFileSync(path.join(FR, 'f_' + String(n++).padStart(5, '0') + '.jpg'), Buffer.from(p.data, 'base64')); stamps.push(p.metadata.timestamp); c.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); });
  await c.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // 1. landing
  await cap('sOHM, the (3,3) reserve of Solana'); await sleep(3400);
  await cap('Open the app'); await c.ev('dmTo(' + q('header .btn.primary') + ')'); await sleep(1100);
  await c.send('Page.navigate', { url: BASE + '/app' });
  if (!(await wait('document.readyState==="complete"&&window.dmCap&&document.getElementById("mApy")&&document.getElementById("mApy").textContent.includes("%")'))) throw new Error('app did not load');
  await sleep(500);
  // 2. dashboard
  await cap('APY, the rebase clock and the treasury, read live'); await sleep(3400);
  // 3. connect: the wallet signs the session message; the live server checks the signature
  await cap('Connect Phantom'); await go('#connectBtn', 1100);
  const signedIn = await wait('document.getElementById("connectBtn").classList.contains("connected")&&Object.keys(localStorage).some((k)=>k.startsWith("sohm_auth_"))', 15000);
  await cap('One free signature signs you in. No funds move.'); await sleep(3000);
  // 4. bond: live quote
  await cap('Three bond markets, priced off the live SOL price'); await go('[data-view=bond]', 1000); await wait('!!document.getElementById("bondAmt_sol")'); await sleep(2200);
  await cap('1 SOL buys sOHM at 7% under market'); await c.ev('dmTo(document.getElementById("bondAmt_sol"))'); await sleep(900); await c.ev('dmType(document.getElementById("bondAmt_sol"),"1")'); await sleep(2800);
  const quote = await c.ev('document.getElementById("bondOut_sol").textContent');
  await cap('Vested over five days, then claim and stake'); await c.ev('(()=>{const e=document.getElementById("yourBonds");if(e)window.scrollTo({top:e.getBoundingClientRect().top+scrollY-330,behavior:"smooth"});})()'); await sleep(2600); await c.ev('window.scrollTo({top:0,behavior:"smooth"})'); await sleep(700);
  // 5. stake
  await cap('Staking opens the moment $sOHM launches'); await go('[data-view=stake]', 900); await sleep(2800);
  // 6. calculator
  await cap('The calculator: what a stake becomes'); await go('[data-view=calc]', 900); await sleep(900);
  await c.ev('dmTo(document.getElementById("calcAmt"))'); await sleep(700); await c.ev('dmType(document.getElementById("calcAmt"),"1000000",110)'); await sleep(900);
  await cap('Slide the days and watch it compound'); await c.ev('dmTo(document.getElementById("calcDays"))'); await sleep(700); await c.ev('dmSlide(document.getElementById("calcDays"),90,2200)'); await sleep(2400);
  await cap(BASE.replace(/^https?:\/\//, '')); await sleep(2200);
  await c.send('Page.stopScreencast'); await sleep(300); const secs = (Date.now() - t0) / 1000; c.close();
  // frames arrive only when the page repaints, so give each one its real on-screen duration
  const NL = String.fromCharCode(10), fn = (i) => "file 'f_" + String(i).padStart(5, '0') + ".jpg'";
  fs.writeFileSync(path.join(FR, 'list.txt'), stamps.map((t, i) => fn(i) + NL + 'duration ' + Math.max(0.01, i + 1 < stamps.length ? stamps[i + 1] - t : 1.2).toFixed(4)).join(NL) + NL + fn(n - 1) + NL);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(FR, 'list.txt'), '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-fps_mode', 'cfr', '-r', '30', '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-movflags', '+faststart', OUT]);
  fs.rmSync(FR, { recursive: true, force: true }); console.log('OK', path.basename(OUT), secs.toFixed(1) + 's', n + ' frames', 'signedIn', signedIn, 'quote', quote);
})().catch((e) => { console.error(e); process.exit(1); });
