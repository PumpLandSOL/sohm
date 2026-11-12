// sOHM (3,3) app on Solana — metrics, live rebase, stake, bond (real SOL / USDC / USDT payments), claim.
(function () {
  const $ = (id) => document.getElementById(id);
  let M = null, A = null, CFG = null, chainBal = null, wallet = localStorage.getItem('sohm_w') || '';
  let anchor = null, stakeMode = 'stake';
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58dec(s) { let n = 0n; for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const ch of s) { if (ch === '1') out.unshift(0); else break; } return out; }
  function b58enc(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let o = ''; while (n > 0n) { o = B58[Number(n % 58n)] + o; n /= 58n; } for (const b of bytes) { if (b === 0) o = '1' + o; else break; } return o; }
  const isW = (s) => { if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '')) return false; try { return b58dec(s).length === 32; } catch (e) { return false; } };
  const isSig = (s) => /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s || '');
  const commas = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const money = (n) => '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(2));
  const tok = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? commas(n, 0) : commas(n, 2);
  const pct = (n) => (n * 100).toLocaleString('en-US', { maximumFractionDigits: n < 0.01 ? 3 : 2 }) + '%';
  const apyFmt = (n) => commas(n, 0) + '%';
  const px = (p) => '$' + (p >= 0.01 ? p.toFixed(4) : p >= 0.0001 ? p.toFixed(6) : p.toFixed(9));
  const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);
  function toast(t, err) { const e = $('toast'); e.textContent = t; e.className = 'toast show' + (err ? ' err' : ''); clearTimeout(e._t); e._t = setTimeout(() => (e.className = 'toast'), 3600); }
  const errText = (e) => { const m = (e && (e.message || (e.error && e.error.message))) || String(e || ''); if ((e && e.code === 4001) || /reject|denied|cancel/i.test(m)) return 'request rejected in your wallet'; return m.slice(0, 140) || 'wallet error'; };

  // ---- views ----
  const VIEWS = ['dash', 'stake', 'bond', 'calc'];
  function show(v) { document.querySelectorAll('.tab[data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === v)); VIEWS.forEach((s) => $(s).classList.toggle('hide', s !== v)); if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); }
  document.querySelectorAll('[data-view]').forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); show(t.dataset.view); }));
  if (VIEWS.includes(location.hash.slice(1))) show(location.hash.slice(1));
  addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v)) show(v); });

  // ---- wallet: Phantom on Solana ----
  const sol = () => (window.phantom && window.phantom.solana) || (window.solana && window.solana.isPhantom ? window.solana : null);
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  function renderWallet() { const b = $('connectBtn'); if (wallet) { b.textContent = short(wallet); b.classList.add('connected'); b.title = 'Disconnect'; } else { b.textContent = 'Connect'; b.classList.remove('connected'); b.title = ''; } }
  function setWallet(a) {
    if (a && isW(a)) { wallet = a; localStorage.setItem('sohm_w', a); renderWallet(); loadAccount(); loadChainBalance(); }
    else { wallet = ''; A = null; chainBal = null; localStorage.removeItem('sohm_w'); renderWallet(); ['yStaked', 'yBalance', 'yNext'].forEach((id) => ($(id).textContent = '—')); renderYourBonds(); }
  }
  // signed session: one free message signature proves the wallet is yours. Unstake and claim need it.
  const AKEY = () => 'sohm_auth_' + wallet;
  function getAuth() { try { const x = JSON.parse(localStorage.getItem(AKEY()) || 'null'); return x && x.exp > Date.now() + 6e4 ? x : null; } catch (e) { return null; } }
  async function signIn() {
    if (!wallet) return null; const have = getAuth(); if (have) return have; const ph = sol();
    if (!ph || !ph.signMessage) { toast('open Phantom to sign in', true); return null; }
    try { const m = await (await fetch('/api/session?wallet=' + wallet)).json(); if (m.error) throw new Error(m.error);
      toast('Sign the message in Phantom — free, moves no funds');
      const r = await ph.signMessage(new TextEncoder().encode(m.message), 'utf8'); const sig = r && (r.signature || r);
      const auth = { exp: m.exp, sig: b58enc(new Uint8Array(sig)) }; localStorage.setItem(AKEY(), JSON.stringify(auth)); return auth;
    } catch (e) { toast(errText(e), true); return null; }
  }
  function walletMenu() { return new Promise((res) => {
    const here = location.host + location.pathname;
    const m = document.createElement('div'); m.className = 'wpick';
    m.innerHTML = '<div class="wbox2"><div class="pt">Connect a wallet</div><div class="psub">sOHM runs on Solana. Phantom signs you in and sends your stake and bond payments.</div>' +
      '<a class="wopt" href="https://phantom.app/download" target="_blank" rel="noopener"><span class="wi">P</span>Get Phantom<span class="inst">install ↗</span></a>' +
      (mobile ? '<a class="wopt" href="https://phantom.app/ul/browse/' + encodeURIComponent('https://' + here) + '?ref=' + encodeURIComponent('https://' + location.host) + '"><span class="wi">↗</span>Open in the Phantom app<span class="inst">mobile</span></a>' : '') +
      '<button class="cx">Close</button></div>';
    document.body.appendChild(m); m.onclick = (e) => { if (e.target === m || e.target.closest('.cx') || e.target.closest('a')) { m.remove(); res(); } }; }); }
  async function connect() {
    const ph = sol(); if (!ph) { await walletMenu(); return false; }
    try { const r = await ph.connect(); const pk = (r && r.publicKey ? r.publicKey : ph.publicKey).toString(); if (!isW(pk)) throw new Error('wallet returned no Solana address');
      setWallet(pk); toast('Connected · ' + short(pk)); await signIn(); return true;
    } catch (e) { toast(errText(e), true); return false; }
  }
  $('connectBtn').onclick = async () => {
    if (wallet) { localStorage.removeItem(AKEY()); setWallet(''); try { const ph = sol(); if (ph && ph.disconnect) ph.disconnect(); } catch (e) {} toast('Wallet disconnected'); return; }
    await connect();
  };
  // restore a remembered wallet silently, and follow account switches inside Phantom
  setTimeout(() => { const ph = sol(); if (!ph) return;
    if (wallet && ph.connect) ph.connect({ onlyIfTrusted: true }).then((r) => { const pk = (r && r.publicKey ? r.publicKey : ph.publicKey).toString(); if (pk !== wallet) setWallet(pk); }).catch(() => {});
    if (ph.on) ph.on('accountChanged', (pk) => { if (pk) setWallet(pk.toString()); else setWallet(''); }); }, 400);
  renderWallet();

  // ---- Solana transfers, built by hand (legacy message, one instruction) and signed + sent by Phantom ----
  const units = (amt, dec) => { const [i, f = ''] = String(amt).trim().split('.'); return BigInt(i || '0') * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0'); };
  const u64 = (v) => { const o = []; let x = BigInt(v); for (let i = 0; i < 8; i++) { o.push(Number(x & 255n)); x >>= 8n; } return o; };
  // System transfer: keys [payer, treasury, system program]
  function solTransferMessage(owner, to, blockhash, lamports) {
    const K = [owner, to, '11111111111111111111111111111111'].map(b58dec);
    return new Uint8Array([1, 0, 1, 3, ...K.flat(), ...b58dec(blockhash), 1, 2, 2, 0, 1, 12, 2, 0, 0, 0, ...u64(lamports)]);
  }
  // SPL TransferChecked (Token and Token-2022): keys [owner, source, dest, mint, token program]
  function splTransferMessage(owner, source, dest, mint, program, blockhash, amount, decimals) {
    const K = [owner, source, dest, mint, program].map(b58dec);
    return new Uint8Array([1, 0, 2, 5, ...K.flat(), ...b58dec(blockhash), 1, 4, 4, 1, 3, 2, 0, 10, 12, ...u64(amount), decimals]);
  }
  async function pay(kind, market, raw) {
    const ph = sol(); if (!ph || !ph.request) throw new Error('open Phantom to send this payment');
    const I = await post('/api/intent', { wallet, kind, market }); if (I.error) throw new Error(I.error);
    if (parseFloat(raw) > I.balance) throw new Error('this wallet holds ' + tok(I.balance) + ' — not enough for that amount');
    const msg = I.native ? solTransferMessage(wallet, I.treasury, I.blockhash, units(raw, 9)) : splTransferMessage(wallet, I.source, I.dest, I.mint, I.program, I.blockhash, units(raw, I.decimals), I.decimals);
    const r = await ph.request({ method: 'signAndSendTransaction', params: { message: b58enc(msg) } }); return r.signature || r;
  }
  // the server reads the confirmed transaction from Solana; keep asking until it is there
  async function credit(url, payload, what) {
    toast(what + ' sent — waiting for Solana to confirm…');
    for (let i = 0; i < 30; i++) { await new Promise((z) => setTimeout(z, 2500)); const r = await post(url, payload); if (!r.error) return r; if (!/not found|try again/.test(r.error)) throw new Error(r.error); }
    throw new Error(what + ' still confirming — paste its signature under “Credit by signature” in a minute');
  }

  // ---- fetch ----
  async function post(url, b) { try { return await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json(); } catch (e) { return { error: 'request failed' }; } }
  async function loadConfig() { try { CFG = await (await fetch('/api/config')).json(); renderStatic(); } catch (e) {} }
  async function loadMetrics() { try { M = await (await fetch('/api/metrics')).json(); reanchor(); renderMetrics(); renderBonds(); } catch (e) {} }
  async function loadChainBalance() { if (!isW(wallet)) { chainBal = null; return; } try { const r = await post('/api/balance', { wallet }); chainBal = r.error ? null : r.balance; } catch (e) { chainBal = null; } renderAccount(); }
  async function loadAccount() { if (!isW(wallet)) return; try { const r = await post('/api/account', { wallet }); if (r.error) return; A = r; reanchor(); renderAccount(); renderYourBonds(); } catch (e) {} }
  function reanchor() { if (!M) return; anchor = { index: M.index, nextIn: M.nextRebaseIn, rate: M.rate, rebaseSec: M.rebaseSec, t: Date.now(), agons: A && A.staked ? A.staked / A.index : 0, totalStaked: M.totalStaked, price: M.price }; }
  function liveIndex() { if (!anchor) return { index: 1, nextIn: 0 }; let idx = anchor.index, nextIn = anchor.nextIn - (Date.now() - anchor.t) / 1000, g = 0;
    while (nextIn < 0 && g++ < 50) { idx *= 1 + anchor.rate; nextIn += anchor.rebaseSec; } return { index: idx * (1 + anchor.rate * (1 - nextIn / anchor.rebaseSec)), nextIn }; }

  // ---- render ----
  let boostLeft = 0, boostEnd = 0, lockUntil = 0;
  function renderStatic() { if (!CFG) return;
    document.querySelectorAll('[data-x]').forEach((el) => (el.href = CFG.xUrl)); }
  function renderMetrics() {
    if (!M) return;
    $('mApy').textContent = apyFmt(M.apy);
    const note = $('mApyNote'), card = $('mApy').closest('.stat');
    if (M.boost) { boostEnd = Date.now() + M.boost.secondsLeft * 1000; boostLeft = M.boost.secondsLeft; card && card.classList.add('boosting'); note.innerHTML = 'APY boost · <span id="boostCd" class="cd"></span> left'; }
    else { boostLeft = 0; card && card.classList.remove('boosting'); note.textContent = 'compounding every ' + Math.round(M.rebaseSec / 60) + ' min'; }
    $('mTreasury').textContent = money(M.treasury);
    const T = M.treasuryOnchain || {}; $('mBacking').textContent = T.live ? (T.sol || 0).toFixed(2) + ' SOL · ' + commas((T.usdc || 0) + (T.usdt || 0), 0) + ' USD stables on-chain' : 'fills with the first bond';
    $('mPrice').textContent = px(M.price); $('mMc').textContent = (M.mint ? 'mcap ' : 'pump.fun opening price · mcap ') + money(M.marketCap);
    $('mRatio').textContent = pct(M.stakingRatio) + ' of supply';
    $('mRunway').textContent = M.runwayDays == null ? '—' : M.runwayDays >= 365 ? (M.runwayDays / 365).toFixed(1) + ' yr' : M.runwayDays >= 1 ? Math.round(M.runwayDays) + ' days' : (M.runwayDays * 24).toFixed(1) + ' h';
    $('mEpoch').textContent = M.epoch; $('mSol').textContent = T.solUsd ? '$' + T.solUsd.toFixed(2) : '—';
    $('yApy').textContent = apyFmt(M.apy);
    const roi = (d) => Math.pow(1 + M.rate, (d * 86400) / M.rebaseSec) - 1;
    $('yRoi5').textContent = pct(roi(5)); $('yRoi7').textContent = pct(roi(7)); $('yRoi30').textContent = pct(roi(30)); $('yRoi1y').textContent = apyFmt(M.apy);
    if (M.leaderboard && M.leaderboard.length) { $('lbPanel').style.display = 'block'; $('lbRows').innerHTML = M.leaderboard.map((b, i) => `<div class="row"><span><span class="rk">${i + 1}</span> <b class="mono">${b.wallet}</b></span><span><b class="tl">${tok(b.staked)} stOHM</b> <span class="mut">· ${pct(b.share)}</span></span></div>`).join(''); }
    $('stBar').style.width = Math.min(100, M.stakingRatio * 100).toFixed(2) + '%'; $('stRatioLbl').textContent = pct(M.stakingRatio) + ' staked';
    if (M.tape && M.tape.length) { const ago = (t) => { const s = Math.max(1, (Date.now() - t) / 1000); return s < 60 ? Math.floor(s) + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };
      const lab = { stake: ['STAKE', 'up'], unstake: ['UNSTAKE', 'dn'], bond: ['BOND', 'ac'] };
      $('stRows').innerHTML = M.tape.map((e) => { const [l, c] = lab[e.type] || [e.type, '']; const who = `<span class="mono">${e.w}</span>`; return `<div class="trow"><span class="side ${c}">${l}</span>${who}<span class="mono r">${tok(e.amount)} sOHM</span><span class="mut r">${ago(e.t)}</span></div>`; }).join(''); }
    calc();
    if (M.mint && (!CFG || CFG.mint !== M.mint)) loadConfig().then(() => { if (wallet) loadChainBalance(); });   // launch went live: pick up the mint without a reload
    const bar = $('ca'); if (M.mint) { bar.classList.remove('pre'); $('caV').textContent = M.mint; $('caCopy').style.display = ''; bar.href = 'https://pump.fun/coin/' + M.mint; bar.target = '_blank'; bar.rel = 'noopener'; }
    else { bar.classList.add('pre'); $('caV').textContent = 'launching on pump.fun · contract address appears here'; $('caCopy').style.display = 'none'; bar.href = '#bond'; bar.removeAttribute('target'); }
    const pre = $('preStake'); pre.style.display = M.mint ? 'none' : '';
    if (M.paused) { pre.style.display = ''; pre.innerHTML = '<b>Deposits are paused.</b> Do not send sOHM, SOL or stablecoins to the treasury until this notice clears.'; }
    $('stakeBtn').disabled = !!M.paused && stakeMode === 'stake'; document.querySelectorAll('[data-bond]').forEach((b) => (b.disabled = !!M.paused || !M.bondsOpen));
    $('bondClosed').style.display = M.bondsOpen ? 'none' : '';
  }
  $('caCopy').onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (!M || !M.mint) return; navigator.clipboard && navigator.clipboard.writeText(M.mint); $('caCopy').textContent = 'Copied'; setTimeout(() => ($('caCopy').textContent = 'Copy'), 1200); };
  $('ca').addEventListener('click', (e) => { if (!M || !M.mint) { e.preventDefault(); show('bond'); } });
  function renderAccount() { if (!A || !M) return; $('yBalance').textContent = M.mint ? (chainBal == null ? '—' : tok(chainBal) + ' sOHM') : 'opens at launch'; $('yNext').textContent = '+' + (A.staked * M.rate).toFixed(4) + ' stOHM'; updateLockUI();
    if (A.pendingOut > 0) toastOnce('Payout of ' + tok(A.pendingOut) + ' sOHM queued from the treasury'); }
  let _t = ''; const toastOnce = (m) => { if (_t !== m) { _t = m; toast(m); } };
  const fmtDur = (s) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60), ss = s % 60; return m > 0 ? m + 'm ' + String(ss).padStart(2, '0') + 's' : ss + 's'; };
  function updateLockUI() { if (A && A.lockRemaining != null) lockUntil = A.lockRemaining > 0 ? Date.now() + A.lockRemaining * 1000 : 0; const left = lockUntil ? (lockUntil - Date.now()) / 1000 : 0;
    $('yLockRow').style.display = left > 0 ? 'flex' : 'none'; if (left > 0) $('yLock').textContent = fmtDur(left);
    if (stakeMode === 'unstake') { const b = $('stakeBtn'); b.disabled = left > 0; b.textContent = left > 0 ? 'Locked · ' + fmtDur(left) : 'Unstake'; } }
  let bondDrawn = '';
  const GLYPH = { sol: '◎', usdc: '$', usdt: '₮' };
  function renderBonds() {
    if (!M) return; const key = M.bonds.map((b) => b.id + b.price + b.assetUsd).join('|') + M.bondsOpen + M.paused; if (key === bondDrawn) return; bondDrawn = key;
    const typed = {}; M.bonds.forEach((b) => { const el = $('bondAmt_' + b.id); if (el) typed[b.id] = el.value; });
    $('bondCards').innerHTML = M.bonds.map((b) => `
      <div class="bond"><div class="bh"><span class="asset ${b.id}">${GLYPH[b.id] || b.name[0]}</span><div><h3>${b.name}</h3><div class="dl">${b.vestDays}-day linear vest · min ${b.min} ${b.name}</div></div><div class="disc">−${(b.discount * 100).toFixed(1)}%</div></div>
        <div class="br"><span>Bond price</span><b class="mono">${px(b.price)}</b></div>
        <div class="br"><span>Market price</span><b class="mono">${px(M.price)}</b></div>
        <div class="br"><span>${b.name} price</span><b class="mono">$${b.assetUsd ? b.assetUsd.toFixed(2) : '—'}</b></div>
        <div class="br"><span>You receive</span><b class="mono tl" id="bondOut_${b.id}">—</b></div>
        <div class="bf"><input id="bondAmt_${b.id}" type="text" inputmode="decimal" placeholder="${b.name} amount" value="${typed[b.id] || ''}"><button data-bond="${b.id}"${M.paused || !M.bondsOpen ? ' disabled' : ''}>Bond</button></div>
      </div>`).join('');
    M.bonds.forEach((b) => { const el = $('bondAmt_' + b.id), out = () => { const v = parseFloat(el.value) || 0; $('bondOut_' + b.id).textContent = v > 0 && b.price > 0 ? tok((v * b.assetUsd) / b.price) + ' sOHM' : '—'; }; el.addEventListener('input', out); out(); });
    $('bondCards').querySelectorAll('[data-bond]').forEach((btn) => btn.addEventListener('click', () => doBond(btn.dataset.bond)));
  }
  function renderYourBonds() {
    if (!A) { $('yourBonds').innerHTML = '<div class="psub">Connect your wallet to see your bonds.</div>'; return; }
    if (!A.bonds || !A.bonds.length) { $('yourBonds').innerHTML = '<div class="psub">No active bonds yet. Every bond is a real SOL, USDC or USDT payment to the treasury, verified on Solana.</div>'; return; }
    $('yourBonds').innerHTML = A.bonds.map((b) => `<div class="yb"><span>${b.market} · <b class="mono">${tok(b.payout)}</b> sOHM</span><div class="prog"><i style="width:${(b.pct * 100).toFixed(0)}%"></i></div><span class="tl mono"><b>${tok(b.claimable)}</b> claimable</span></div>`).join('') +
      '<div class="brow"><button class="btn ghost" id="claimBtn">Claim to wallet</button><button class="btn primary" id="claimStakeBtn">Claim &amp; stake</button></div>';
    $('claimBtn').onclick = () => doClaim(false); $('claimStakeBtn').onclick = () => doClaim(true);
  }

  // ---- actions ----
  $('segStake').onclick = () => { stakeMode = 'stake'; $('segStake').classList.add('on'); $('segUnstake').classList.remove('on'); $('stakeBtn').disabled = !!(M && M.paused); $('stakeBtn').textContent = 'Stake'; };
  $('segUnstake').onclick = () => { stakeMode = 'unstake'; $('segUnstake').classList.add('on'); $('segStake').classList.remove('on'); $('stakeBtn').disabled = false; $('stakeBtn').textContent = 'Unstake'; updateLockUI(); };
  $('stakeMax').onclick = () => { $('stakeAmt').value = (stakeMode === 'stake' ? chainBal || 0 : A ? A.staked : 0).toFixed(2); };
  async function needWallet() { if (isW(wallet)) return true; return await connect(); }
  $('stakeBtn').onclick = async () => {
    if (!(await needWallet())) return;
    const raw = $('stakeAmt').value, amt = parseFloat(raw); if (!(amt > 0)) return toast('enter an amount', true);
    try {
      if (stakeMode === 'stake') {
        if (M && M.paused) return toast('deposits are paused', true);
        if (!CFG || !CFG.mint) return toast('staking opens the moment $sOHM launches — bond now to get sOHM at a discount', true);
        if (CFG.minStake && amt < CFG.minStake) return toast('minimum stake is ' + tok(CFG.minStake) + ' sOHM', true);
        const tx = await pay('stake', null, raw); const r = await credit('/api/stake', { wallet, tx }, 'Deposit');
        A = r; reanchor(); renderAccount(); loadChainBalance(); loadMetrics(); $('stakeAmt').value = ''; toast('Staked ' + tok(r.credited) + ' sOHM · (3,3)');
      } else { const auth = await signIn(); if (!auth) return; const r = await post('/api/unstake', { wallet, amount: amt, auth }); if (r.error) { if (r.auth) localStorage.removeItem(AKEY()); return toast(r.error, true); } A = r; reanchor(); renderAccount(); loadMetrics(); $('stakeAmt').value = ''; toast('Unstaked — ' + tok(r.queued) + ' sOHM queued for payout'); }
    } catch (e) { toast(errText(e), true); }
  };
  async function doBond(id) {
    if (M && M.paused) return toast('bonds are paused', true);
    if (!(await needWallet())) return;
    const m = M.bonds.find((b) => b.id === id), raw = ($('bondAmt_' + id) || {}).value || '', amt = parseFloat(raw);
    if (!(amt > 0)) return toast('enter an amount', true); if (amt < m.min) return toast('minimum bond is ' + m.min + ' ' + m.name, true);
    try {
      const tx = await pay('bond', id, raw); const r = await credit('/api/bond', { wallet, market: id, tx }, 'Payment');
      A = r; renderYourBonds(); loadMetrics(); $('bondAmt_' + id).value = ''; toast('Bonded ' + r.paid + ' ' + m.name + ' → ' + tok(r.payout) + ' sOHM vesting');
    } catch (e) { toast(errText(e), true); }
  }
  async function doClaim(autostake) { const auth = await signIn(); if (!auth) return; const r = await post('/api/claim', { wallet, autostake, auth }); if (r.error) { if (r.auth) localStorage.removeItem(AKEY()); return toast(r.error, true); } A = r; reanchor(); renderAccount(); renderYourBonds(); loadMetrics(); toast(autostake ? 'Claimed & staked ' + tok(r.claimed) + ' stOHM' : 'Claimed ' + tok(r.claimed) + ' sOHM — queued to your wallet'); }
  // a payment that confirmed after the tab was closed can still be credited: the signature is all the server needs
  $('sigBtn').onclick = async () => {
    if (!(await needWallet())) return; const tx = $('sigIn').value.trim(), kind = $('sigKind').value; if (!isSig(tx)) return toast('paste a Solana transaction signature', true);
    const r = kind === 'stake' ? await post('/api/stake', { wallet, tx }) : await post('/api/bond', { wallet, market: kind, tx }); if (r.error) return toast(r.error, true);
    A = r; reanchor(); renderAccount(); renderYourBonds(); loadMetrics(); $('sigIn').value = ''; toast(kind === 'stake' ? 'Staked ' + tok(r.credited) + ' sOHM' : 'Bond credited → ' + tok(r.payout) + ' sOHM vesting');
  };

  // ---- live tick ----
  function tick() {
    if (!anchor || !M) return; const li = liveIndex(), cd = Math.max(0, li.nextIn), cds = Math.floor(cd / 60) + ':' + String(Math.floor(cd % 60)).padStart(2, '0');
    $('mRebase').textContent = cds; $('yRebase').textContent = cds; $('mIndex').textContent = li.index.toFixed(5);
    $('mStaked').textContent = tok(anchor.totalStaked * (li.index / anchor.index)) + ' stOHM';
    if (A) $('yStaked').textContent = commas(anchor.agons * li.index, 4) + ' stOHM';
    const ring = $('ring'); if (ring) ring.style.setProperty('--p', (1 - cd / M.rebaseSec) * 360 + 'deg');
    if (lockUntil) updateLockUI();
    if (boostLeft > 0) { boostLeft = (boostEnd - Date.now()) / 1000; const b = $('boostCd'); if (b) { const s = Math.max(0, boostLeft); b.textContent = Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0'); } }
  }
  function calc() { if (!M) return; const amt = parseFloat($('calcAmt').value) || 0, days = +$('calcDays').value; $('calcDaysL').textContent = days; $('calcPrice').textContent = px(M.price).slice(1);
    const out = amt * Math.pow(1 + M.rate, (days * 86400) / M.rebaseSec); $('calcOut').textContent = tok(out) + ' sOHM'; $('calcMult').textContent = (out / (amt || 1)).toFixed(1) + '× your stake'; $('calcUsd').textContent = money(out * M.price); $('calcProfit').textContent = '+' + money((out - amt) * M.price); }
  $('calcAmt').addEventListener('input', calc); $('calcDays').addEventListener('input', calc);
  loadConfig().then(() => { if (wallet) loadChainBalance(); }); loadMetrics(); if (wallet) loadAccount();
  setInterval(loadMetrics, 6000); setInterval(() => { if (wallet) loadAccount(); }, 8000); renderYourBonds(); setInterval(tick, 100); tick();
})();
