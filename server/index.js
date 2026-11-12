// sOHM ($sOHM) — OHM-style (3,3) staking + bonding + treasury protocol on Solana.
// Bonds are paid in real SOL, USDC or USDT on Solana mainnet and verified on-chain before anything is credited.
// Fixed supply => rebases do not mint on-chain. The index, the stOHM ledger and the bond vesting
// run in this server; deposits, bond payments and the treasury itself are real and read from Solana.
// Staked $sOHM and bond payments sit in the treasury wallet; payouts are sent from it.
// Dependency-free: Node http + crypto.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- PLACEHOLDERS: the only place the domain and the X handle are set (or use the env vars) ----------
const SITE_URL = (process.env.SITE_URL || 'https://YOUR-DOMAIN.example').replace(/\/$/, '');
const X_URL = process.env.X_URL || 'https://x.com/SolanaOHM';

// private settings (TREASURY_WALLET, ADMIN_KEY…) can live in a git-ignored .env next to package.json; real env vars win
try { for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; } } catch (e) {}

const BOOT_TS = Date.now();
const PORT = process.env.PORT || 8290;
const ROOT = path.join(__dirname, '..');
const TOKEN = process.env.TOKEN_TICKER || 'sOHM';
const STAKED = process.env.STAKED_TICKER || 'stOHM';
const DATA_PATH = process.env.DATA_PATH || path.join(ROOT, 'data.json');
// $sOHM SPL mint (pump.fun). Staking opens the instant this is known: set SOHM_MINT, or call /api/admin/mint (no redeploy, persisted).
let SOHM_MINT = process.env.SOHM_MINT || '', MINT_DEC = +(process.env.SOHM_DECIMALS || 6);
// PAUSE switch: no new stakes or bonds while paused (env DEPOSITS_PAUSED=1 or /api/admin/pause?key=…&on=1). Off by default.
let PAUSED = process.env.DEPOSITS_PAUSED === '1';
// treasury: the Solana wallet that receives bond payments and staked $sOHM (key held offline by the operator — never on this server).
// The address is set by env only and is never printed on a page, in the docs or in the public config/metrics/tape:
// it is handed to a wallet only inside /api/intent, at the moment that wallet builds a payment.
const TREASURY_WALLET = process.env.TREASURY_WALLET || '';
const USDC = process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';   // USDC on Solana (6 dp)
const USDT = process.env.USDT_MINT || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';   // USDT on Solana (6 dp)
const EXPLORER = process.env.EXPLORER || 'https://solscan.io';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MIN_STAKE = +(process.env.MIN_STAKE || 300000);  // minimum $sOHM per stake deposit
const LOCK_SEC = +(process.env.LOCK_SEC || 3600);      // stake lock: must stay staked at least this long before unstaking
const RPCS = (process.env.SOL_RPCS || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com').split(',');
async function rpc(method, params) {
  let err; for (const u of RPCS) { try {
    const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; } catch (e) { err = e; } }
  throw err || new Error('rpc');
}
// ---------- base58 / addresses ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(str) { let n = 0n; for (const ch of str) { const i = B58.indexOf(ch); if (i < 0) throw new Error('b58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const ch of str) { if (ch === '1') out.unshift(0); else break; } return Buffer.from(out); }
const isWallet = (s) => { if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false; try { return b58dec(s).length === 32; } catch (e) { return false; } };
const isSig = (s) => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s);
const shortW = (a) => a.slice(0, 4) + '…' + a.slice(-4);

const REBASE_SEC = +(process.env.REBASE_SEC || 300);           // epoch length (5 min)
// Dynamic APY (OHM-style reflexive emissions): rich when the pool is small, decaying as it fills.
// apy = APY_MIN + (APY_MAX - APY_MIN) * HALF / (HALF + totalStaked)
const APY_MAX = +(process.env.APY_MAX || 50000);
const APY_MIN = +(process.env.APY_MIN || 6000);
const APY_HALF = +(process.env.APY_HALF || 4e6);
// APY BOOST: while active, APY is floored at BOOST_APY. Armed for 24 h the moment the mint goes live, or via /api/admin/boost.
const BOOST_APY = +(process.env.BOOST_APY || 500000);
const BOOST_UNTIL_ENV = +(process.env.BOOST_UNTIL || 0);
const BOOST_HOURS = +(process.env.BOOST_HOURS || 0);
const TOTAL_SUPPLY = +(process.env.TOTAL_SUPPLY || 1e9);       // pump.fun fixed supply
// $ per sOHM. Live from the deepest Solana pool once the mint is set. Before launch: TOKEN_PRICE env,
// otherwise the pump.fun bonding curve's opening price (30 SOL virtual / 1.073B tokens ≈ 2.8e-8 SOL).
const PUMP_OPEN_SOL = 30 / 1073000000;
let LIVE_PRICE = 0;
const tokenPrice = () => LIVE_PRICE || +(process.env.TOKEN_PRICE || 0) || PUMP_OPEN_SOL * SOL_USD;
async function pollPrice() {
  if (!SOHM_MINT) return;
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + SOHM_MINT, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    const pairs = ((await r.json()).pairs || []).filter((p) => p.chainId === 'solana' && +p.priceUsd > 0);
    pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
    if (pairs[0]) LIVE_PRICE = +pairs[0].priceUsd;
  } catch (e) { /* keep last good */ }
}
// SOL price: Coinbase spot first (keyless), CoinGecko as the fallback
let SOL_USD = +(process.env.SOL_USD || 0);
async function pollSol() {
  try { const j = await (await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot', { signal: AbortSignal.timeout(10000) })).json(); const p = +j.data.amount; if (p > 0) { SOL_USD = p; return; } } catch (e) {}
  try { const j = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { signal: AbortSignal.timeout(10000) })).json(); if (j.solana && j.solana.usd > 0) SOL_USD = j.solana.usd; } catch (e) {}
}
// the treasury, read straight from Solana: SOL, USDC, USDT and the $sOHM it holds for stakers
const CHAIN = { slot: 0, slotAt: 0, sol: 0, usdc: 0, usdt: 0, sohm: 0, ok: false };
async function tokenAccounts(owner, mint) {
  const r = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  return (r.value || []).map((a) => ({ pubkey: a.pubkey, program: a.account.owner, amount: +a.account.data.parsed.info.tokenAmount.uiAmountString || 0, frozen: a.account.data.parsed.info.state === 'frozen', decimals: a.account.data.parsed.info.tokenAmount.decimals })).sort((a, b) => b.amount - a.amount);
}
const sumAcc = (l) => l.reduce((s, x) => s + x.amount, 0);
async function pollTreasury() {
  try { CHAIN.slot = await rpc('getSlot', [{ commitment: 'confirmed' }]); CHAIN.slotAt = Date.now(); CHAIN.ok = true; } catch (e) { CHAIN.ok = false; }
  if (!TREASURY_WALLET) return;
  try { CHAIN.sol = (await rpc('getBalance', [TREASURY_WALLET, { commitment: 'confirmed' }])).value / 1e9; } catch (e) {}
  try { CHAIN.usdc = sumAcc(await tokenAccounts(TREASURY_WALLET, USDC)); } catch (e) {}
  try { CHAIN.usdt = sumAcc(await tokenAccounts(TREASURY_WALLET, USDT)); } catch (e) {}
  if (SOHM_MINT) try { CHAIN.sohm = sumAcc(await tokenAccounts(TREASURY_WALLET, SOHM_MINT)); } catch (e) {}
}
const SEED_BALANCE = 0;   // every sOHM in the ledger comes from a real deposit or bond
const REBASES_YR = 31557600 / REBASE_SEC;
function poolStaked() { return db.totalAgons * db.index; }   // the stOHM ledger: what stakers are owed
function boostUntil() { return Math.max(BOOST_UNTIL_ENV, db.boostUntil || 0, BOOST_HOURS > 0 ? BOOT_TS + BOOST_HOURS * 3600e3 : 0); }
function boostActive() { return Date.now() < boostUntil(); }
const FIXED_APY = +(process.env.FIXED_APY || 250000);  // pin the emission APY; set 0 to use the dynamic curve
function currentApy(ts) {
  if (FIXED_APY > 0) return boostActive() ? Math.max(FIXED_APY, BOOST_APY) : FIXED_APY;
  const s = ts == null ? poolStaked() : ts;
  const base = APY_MIN + (APY_MAX - APY_MIN) * (APY_HALF / (APY_HALF + Math.max(0, s)));
  return boostActive() ? Math.max(base, BOOST_APY) : base;
}
function currentRate(ts) { return Math.pow(1 + currentApy(ts) / 100, 1 / REBASES_YR) - 1; }
const BONDS = [
  { id: 'sol', name: 'SOL', discount: +(process.env.BOND_SOL_DISC || 0.07), vestDays: 5, asset: 'native', dec: 9, min: +(process.env.BOND_SOL_MIN || 0.05) },
  { id: 'usdc', name: 'USDC', discount: +(process.env.BOND_USDC_DISC || 0.05), vestDays: 5, asset: USDC, dec: 6, min: +(process.env.BOND_USDC_MIN || 5) },
  { id: 'usdt', name: 'USDT', discount: +(process.env.BOND_USDT_DISC || 0.06), vestDays: 5, asset: USDT, dec: 6, min: +(process.env.BOND_USDT_MIN || 5) },
];
const assetUsd = (m) => (m.asset === 'native' ? SOL_USD : 1);

// ---------- state ----------
let db = { index: 1, epoch: 0, lastRebase: Date.now(), treasury: 0, totalAgons: 0, wallets: {} };
function readDb(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
try { db = Object.assign(db, readDb(DATA_PATH)); } catch (e) { try { db = Object.assign(db, readDb(DATA_PATH + '.bak')); } catch (e2) {} }
if (!db.wallets) db.wallets = {};
if (!db.tape) db.tape = [];
if (!db.withdrawals) db.withdrawals = [];
if (!db.bondTx) db.bondTx = [];
if (!db.stakeTx) db.stakeTx = [];
if (!SOHM_MINT && db.mint) { SOHM_MINT = db.mint; MINT_DEC = db.mintDec || 6; }
function armLaunchBoost() { if (SOHM_MINT && db.boostArmed !== 'launch-24h') { db.boostArmed = 'launch-24h'; db.boostUntil = Date.now() + 24 * 3600e3; save(); } }
const treasuryUsd = () => Math.max(db.treasury, CHAIN.sol * SOL_USD + CHAIN.usdc + CHAIN.usdt);
function tapePush(type, wallet, amount) {
  db.tape.unshift({ t: Date.now(), type, w: shortW(wallet), amount: +(+amount).toFixed(2) });
  if (db.tape.length > 60) db.tape.length = 60;
}
// atomic save: write a temp file, keep the previous one as .bak, rename into place
function saveNow() { try { fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true }); const tmp = DATA_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); try { fs.copyFileSync(DATA_PATH, DATA_PATH + '.bak'); } catch (e) {} fs.renameSync(tmp, DATA_PATH); } catch (e) {} }
let saveT = null; function save() { if (saveT) return; saveT = setTimeout(() => { saveT = null; saveNow(); }, 800); }

function rebase() { db.index *= (1 + currentRate()); db.epoch++; db.lastRebase = Date.now(); save(); }
(function catchup() { const missed = Math.floor((Date.now() - db.lastRebase) / 1000 / REBASE_SEC); for (let i = 0; i < Math.min(missed, 10000); i++) rebase(); })();
armLaunchBoost();

function liveIndex() { const frac = (Date.now() - db.lastRebase) / 1000 / REBASE_SEC; return db.index * (1 + currentRate() * Math.max(0, Math.min(1, frac))); }
function W(addr) { return db.wallets[addr] || (db.wallets[addr] = { balance: SEED_BALANCE, agons: 0, bonds: [] }); }
function stakedOf(w, idx) { return w.agons * (idx || liveIndex()); }
const circulating = () => TOTAL_SUPPLY;

function metrics() {
  const idx = liveIndex(), price = tokenPrice();
  const ts = poolStaked();
  const leaderboard = Object.entries(db.wallets).map(([a, w]) => ({ a, staked: w.agons * idx }))
    .filter((x) => x.staked > 0.001).sort((x, y) => y.staked - x.staked);
  const backing = treasuryUsd() / circulating();
  const rate = currentRate(ts); const rewardsPerDay = ts * (Math.pow(1 + rate, 86400 / REBASE_SEC) - 1) * price;
  // nothing staked => nothing emitting => runway is undefined, not zero. null so the UI can say so.
  const runway = rewardsPerDay > 0 ? treasuryUsd() / rewardsPerDay : null;
  return {
    token: TOKEN, staked: STAKED, apy: currentApy(ts), rate, index: +idx.toFixed(6), epoch: db.epoch,
    totalStaked: ts, circulating: circulating(), stakingRatio: ts / circulating(),
    treasury: treasuryUsd(), treasuryOnchain: { sol: CHAIN.sol, usdc: CHAIN.usdc, usdt: CHAIN.usdt, sohm: CHAIN.sohm, solUsd: SOL_USD, live: !!TREASURY_WALLET },
    bondedUsd: db.treasury, backingPerToken: backing, price, marketCap: price * circulating(),
    runwayDays: runway, rebaseSec: REBASE_SEC, nextRebaseIn: Math.max(0, REBASE_SEC - (Date.now() - db.lastRebase) / 1000),
    bonds: BONDS.map((b) => ({ id: b.id, name: b.name, discount: b.discount, vestDays: b.vestDays, price: price * (1 - b.discount), asset: b.asset, dec: b.dec, min: b.min, assetUsd: assetUsd(b) })),
    leaderboard: leaderboard.slice(0, 8).map((x) => ({ wallet: shortW(x.a), staked: x.staked, share: ts > 0 ? x.staked / ts : 0 })),
    stakers: leaderboard.length, paused: PAUSED, bondsOpen: !!TREASURY_WALLET, mint: SOHM_MINT, slot: CHAIN.slot, slotAt: CHAIN.slotAt, tape: db.tape.slice(0, 12).map((e) => ({ t: e.t, type: e.type, w: e.w, amount: e.amount })),
    boost: boostActive() ? { apy: BOOST_APY, until: boostUntil(), secondsLeft: Math.ceil((boostUntil() - Date.now()) / 1000) } : null,
  };
}
function account(addr) {
  const w = W(addr); const idx = liveIndex();
  const now = Date.now();
  const bonds = w.bonds.filter((b) => !b.done).map((b) => {
    const pct = Math.max(0, Math.min(1, (now - b.start) / (b.end - b.start)));
    const claimable = b.payout * pct - b.claimed;
    return { market: b.market, payout: b.payout, claimable: Math.max(0, claimable), pct, endsIn: Math.max(0, (b.end - now) / 1000), tx: b.tx };
  });
  const pendingOut = db.withdrawals.filter((x) => x.wallet === addr && x.status === 'pending').reduce((s, x) => s + x.amount, 0);
  return { wallet: addr, staked: stakedOf(w, idx), index: +idx.toFixed(6),
    nextReward: stakedOf(w, idx) * currentRate(), bonds, pendingOut,
    lockRemaining: Math.max(0, Math.ceil(((w.lockUntil || 0) - Date.now()) / 1000)) };
}

// ---------- sessions: unstake and claim are signed by the wallet (Phantom signMessage, ed25519) ----------
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const SESSIONS = new Map();
const sessionMsg = (w, exp) => ['sOHM session', 'Wallet: ' + w, 'Expires: ' + exp, 'Signing is free and moves no funds.'].join('\n');
function requireSess(w, auth) {
  if (!auth || !auth.sig || !auth.exp) throw 'sign in with your wallet first';
  const exp = +auth.exp; if (!(exp > Date.now())) throw 'session expired, sign in again'; if (exp > Date.now() + 8 * 864e5) throw 'bad session';
  const key = w + ':' + exp + ':' + auth.sig; if (SESSIONS.get(key)) return true;
  let ok = false;
  try { const pk = b58dec(w), sig = b58dec(String(auth.sig)); if (pk.length !== 32 || sig.length !== 64) throw 0;
    ok = crypto.verify(null, Buffer.from(sessionMsg(w, exp), 'utf8'), crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, pk]), format: 'der', type: 'spki' }), sig); } catch (e) { throw 'bad signature'; }
  if (!ok) throw 'signature is not from this wallet';
  if (SESSIONS.size > 5000) SESSIONS.clear(); SESSIONS.set(key, 1); return true;
}

// ---------- on-chain verification ----------
// Reads a confirmed Solana transaction and returns how much of `asset` ('native' SOL or an SPL mint)
// moved from `wallet` into the treasury. Uses the balance deltas Solana itself recorded for the
// transaction, so it is correct for plain transfers, routers, Token-2022 and transfer fees alike.
async function readPayment(sig, wallet, asset, treasury) {
  treasury = treasury || TREASURY_WALLET;
  const tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  if (!tx) throw 'transaction not found on Solana yet — try again in a few seconds';
  if (!tx.meta || tx.meta.err) throw 'transaction failed on-chain';
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? { pubkey: k, signer: false } : k));
  if (!keys.some((k) => k.signer && k.pubkey === wallet)) throw 'transaction was not signed by your wallet';
  let inn = 0, out = 0;
  if (asset === 'native') {
    const i = keys.findIndex((k) => k.pubkey === treasury), j = keys.findIndex((k) => k.pubkey === wallet);
    if (i < 0) throw 'payment did not go to the treasury';
    inn = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9; out = (tx.meta.preBalances[j] - tx.meta.postBalances[j]) / 1e9;
  } else {
    const net = (owner) => { const m = {}; let dec = 0;
      for (const b of tx.meta.preTokenBalances || []) if (b.mint === asset && b.owner === owner) { m[b.accountIndex] = -BigInt(b.uiTokenAmount.amount); dec = b.uiTokenAmount.decimals; }
      for (const b of tx.meta.postTokenBalances || []) if (b.mint === asset && b.owner === owner) { m[b.accountIndex] = (m[b.accountIndex] || 0n) + BigInt(b.uiTokenAmount.amount); dec = b.uiTokenAmount.decimals; }
      let s = 0n; for (const k in m) s += m[k]; return Number(s) / 10 ** dec; };
    inn = net(treasury); out = -net(wallet);
  }
  // credit what arrived in the treasury, capped at what this wallet itself paid out
  const amt = Math.min(inn, out);
  return { amount: amt > 0 ? +amt.toFixed(9) : 0, slot: tx.slot };
}
// handed to a wallet at the moment it builds its transfer: where to pay, from which of its accounts, and a fresh blockhash
async function intent(wallet, asset) {
  if (!TREASURY_WALLET) throw 'bonds are not open yet';
  const bh = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;
  if (asset === 'native') { const bal = (await rpc('getBalance', [wallet, { commitment: 'confirmed' }])).value / 1e9; return { native: true, treasury: TREASURY_WALLET, blockhash: bh, balance: bal, decimals: 9 }; }
  // a wallet can own several token accounts for one mint, and an issuer can freeze one: use the largest usable account on each side
  const [dst, src] = (await Promise.all([tokenAccounts(TREASURY_WALLET, asset), tokenAccounts(wallet, asset)])).map((l) => l.filter((a) => !a.frozen));
  if (!dst[0]) throw 'this market is not open yet — bond with SOL for now';
  if (!src[0] || !src[0].amount) throw 'this wallet holds none of this token on Solana';
  return { native: false, treasury: TREASURY_WALLET, source: src[0].pubkey, dest: dst[0].pubkey, mint: asset, decimals: src[0].decimals, program: src[0].program, blockhash: bh, balance: src[0].amount };
}

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const PAGES = { '/': '/client/landing.html', '/app': '/client/index.html', '/app/': '/client/index.html', '/docs': '/client/docs.html', '/docs/': '/client/docs.html' };
// HTML pages carry {{SITE_URL}} / {{X_URL}} tokens so the placeholders live in one place (top of this file)
function fill(html) { return html.replace(/\{\{SITE_URL\}\}/g, SITE_URL).replace(/\{\{X_URL\}\}/g, X_URL); }
function serve(req, res) {
  let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (PAGES[u]) u = PAGES[u];
  if (!u.startsWith('/client/')) { res.writeHead(404); return res.end('not found'); }
  const f = path.normalize(path.join(ROOT, u)); if (!f.startsWith(path.join(ROOT, 'client'))) { res.writeHead(403); return res.end('no'); }
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('not found'); } const ext = path.extname(f);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }); res.end(ext === '.html' ? fill(b.toString('utf8')) : b); });
}
function json(res, c, o) { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
function body(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e4) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }
const admin = (req) => { const q = new URL(req.url, 'http://x').searchParams; return ADMIN_KEY && q.get('key') === ADMIN_KEY ? q : null; };
const errMsg = (e, fallback) => (typeof e === 'string' ? e : fallback);

const server = http.createServer(async (req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/health') return json(res, 200, { ok: true, epoch: db.epoch, chain: CHAIN.ok, slot: CHAIN.slot });
  if (u === '/api/admin/pause') { const q = admin(req); if (!q) return json(res, 403, { error: 'nope' }); PAUSED = q.get('on') !== '0'; return json(res, 200, { ok: true, paused: PAUSED }); }
  // operator: switch staking on the moment $sOHM is live. Verifies it is an SPL mint on Solana and reads its decimals.
  if (u === '/api/admin/mint') {
    const q = admin(req); if (!q) return json(res, 403, { error: 'nope' });
    const m = String(q.get('mint') || ''); if (!isWallet(m)) return json(res, 200, { error: 'mint must be a Solana address' });
    try { const sp = await rpc('getTokenSupply', [m]);
      SOHM_MINT = m; MINT_DEC = sp.value.decimals; db.mint = m; db.mintDec = MINT_DEC; armLaunchBoost(); save(); pollTreasury(); pollPrice();
      return json(res, 200, { ok: true, mint: m, decimals: MINT_DEC, supply: sp.value.uiAmountString, treasury: TREASURY_WALLET, staking: 'open' });
    } catch (e) { return json(res, 200, { error: 'not an SPL token mint on Solana — ' + e.message }); } }
  if (u === '/api/config') return json(res, 200, { token: TOKEN, staked: STAKED, rebaseSec: REBASE_SEC, mint: SOHM_MINT, decimals: MINT_DEC, paused: PAUSED, bondsOpen: !!TREASURY_WALLET, minStake: MIN_STAKE, lockSec: LOCK_SEC, network: 'solana', explorer: EXPLORER, usdc: USDC, usdt: USDT, solUsd: SOL_USD, siteUrl: SITE_URL, xUrl: X_URL });
  if (u === '/api/metrics') return json(res, 200, metrics());
  if (u === '/api/session') { const w = new URL(req.url, 'http://x').searchParams.get('wallet') || ''; if (!isWallet(w)) return json(res, 200, { error: 'bad wallet' }); const exp = Date.now() + 7 * 864e5; return json(res, 200, { exp, message: sessionMsg(w, exp) }); }
  if (req.method === 'POST' && u === '/api/balance') { const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'bad wallet' }); if (!SOHM_MINT) return json(res, 200, { balance: 0, prelaunch: true }); try { return json(res, 200, { balance: sumAcc(await tokenAccounts(d.wallet, SOHM_MINT)) }); } catch (e) { return json(res, 200, { error: 'rpc unavailable' }); } }
  if (req.method === 'POST' && u === '/api/account') { const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'connect a Solana wallet' }); return json(res, 200, account(d.wallet)); }
  // what the wallet needs to build its own transfer (stake = $sOHM, bond = the market's asset)
  if (req.method === 'POST' && u === '/api/intent') {
    const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'bad wallet' });
    if (PAUSED) return json(res, 200, { error: 'deposits are paused — do not send funds to the treasury' });
    let asset; if (d.kind === 'stake') { if (!SOHM_MINT) return json(res, 200, { error: 'staking opens the moment $sOHM launches' }); asset = SOHM_MINT; }
    else { const m = BONDS.find((x) => x.id === d.market); if (!m) return json(res, 200, { error: 'bad market' }); asset = m.asset; }
    try { return json(res, 200, await intent(d.wallet, asset)); } catch (e) { return json(res, 200, { error: errMsg(e, 'Solana RPC is busy — try again in a moment') }); }
  }
  // stake = a real $sOHM transfer to the treasury. The server reads the confirmed transaction from Solana and
  // credits stOHM for the amount that actually arrived — never the client's claim, never the same signature twice.
  if (req.method === 'POST' && u === '/api/stake') {
    const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'bad wallet' });
    if (PAUSED) return json(res, 200, { error: 'deposits are paused — do not send sOHM to the treasury' });
    if (!SOHM_MINT) return json(res, 200, { error: 'staking opens the moment $sOHM launches — bond SOL or USDC now to get sOHM at a discount' });
    if (!TREASURY_WALLET) return json(res, 200, { error: 'staking is not open yet' });
    if (!isSig(d.tx)) return json(res, 200, { error: 'missing deposit signature — stake sends $sOHM to the treasury first' });
    if (db.stakeTx.includes(d.tx) || db.bondTx.includes(d.tx)) return json(res, 200, { error: 'deposit already credited' });
    let p; try { p = await readPayment(d.tx, d.wallet, SOHM_MINT); } catch (e) { return json(res, 200, { error: errMsg(e, 'could not verify deposit — try again in a moment') }); }
    const amt = p.amount;
    if (!(amt > 0)) return json(res, 200, { error: 'no $sOHM moved from your wallet to the treasury in this transaction' });
    if (amt < MIN_STAKE) return json(res, 200, { error: 'below minimum — deposit was ' + amt.toLocaleString() + ', minimum is ' + MIN_STAKE.toLocaleString() + ' $sOHM' });
    if (db.stakeTx.includes(d.tx)) return json(res, 200, { error: 'deposit already credited' });
    const w = W(d.wallet); const idx = liveIndex(); const ag = amt / idx; w.agons += ag; db.totalAgons += ag;
    w.lockUntil = Date.now() + LOCK_SEC * 1000;
    db.stakeTx.push(d.tx); tapePush('stake', d.wallet, amt); Object.assign(db.tape[0], { tx: d.tx, ag, addr: d.wallet }); save();
    return json(res, 200, { ok: true, credited: amt, ...account(d.wallet) });
  }
  // operator: re-verify every credited stake against the chain and reverse any that don't check out.
  if (u === '/api/admin/reverify') {
    if (!admin(req)) return json(res, 403, { error: 'nope' });
    const reversed = [];
    for (const e of db.tape) {
      if (e.type !== 'stake' || !e.tx || !e.addr || e.bad) continue;
      let ok = false;
      try { ok = (await readPayment(e.tx, e.addr, SOHM_MINT)).amount > 0; } catch (x) { if (typeof x !== 'string' || /not found/.test(x)) continue; /* leave untouched if RPC is flaky */ }
      if (!ok) {
        const ag = e.ag != null ? e.ag : e.amount / liveIndex();
        if (db.wallets[e.addr]) db.wallets[e.addr].agons = Math.max(0, db.wallets[e.addr].agons - ag);
        db.totalAgons = Math.max(0, db.totalAgons - ag);
        e.bad = true; reversed.push({ wallet: e.w, amount: e.amount, tx: e.tx });
      }
    }
    save(); return json(res, 200, { reversed, count: reversed.length });
  }
  // unstake = join the payout queue; payouts are sent from the treasury wallet. Signed session required.
  if (req.method === 'POST' && u === '/api/unstake') {
    const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'bad wallet' });
    try { requireSess(d.wallet, d.auth); } catch (e) { return json(res, 200, { error: errMsg(e, 'sign in again'), auth: true }); }
    const w = W(d.wallet); const lockLeft = Math.ceil(((w.lockUntil || 0) - Date.now()) / 1000);
    if (lockLeft > 0) return json(res, 200, { error: 'staked positions are locked for ' + Math.round(LOCK_SEC / 60) + ' min — ' + Math.ceil(lockLeft / 60) + ' min left' });
    const idx = liveIndex(); const have = stakedOf(w, idx); const amt = Math.max(0, Math.min(+d.amount || 0, have)); if (amt <= 0) return json(res, 200, { error: 'nothing staked' });
    const ag = amt / idx; w.agons = Math.max(0, w.agons - ag); db.totalAgons = Math.max(0, db.totalAgons - ag);
    db.withdrawals.push({ wallet: d.wallet, amount: +amt.toFixed(4), kind: 'unstake', t: Date.now(), status: 'pending' }); tapePush('unstake', d.wallet, amt); save();
    return json(res, 200, { ok: true, queued: +amt.toFixed(4), ...account(d.wallet) });
  }
  if (u === '/api/admin/boost') {
    const q = admin(req); if (!q) return json(res, 403, { error: 'nope' });
    if (q.get('off')) { db.boostUntil = 0; save(); return json(res, 200, { ok: true, boost: null }); }
    const hours = Math.max(0, +q.get('hours') || 24);
    db.boostUntil = Date.now() + hours * 3600e3; save();
    return json(res, 200, { ok: true, boostApy: BOOST_APY, until: db.boostUntil, hours });
  }
  // operator export: who is owed what. ?paid=<index>&tx=<signature> marks a payout as sent.
  if (u === '/api/withdrawals') { const q = admin(req); if (!q) return json(res, 403, { error: 'nope' });
    if (q.get('paid') != null) { const x = db.withdrawals[+q.get('paid')]; if (x) { x.status = 'paid'; x.tx = q.get('tx') || ''; save(); } }
    return json(res, 200, { treasury: TREASURY_WALLET, pending: db.withdrawals.map((x, i) => ({ i, ...x })).filter((x) => x.status === 'pending'), all: db.withdrawals }); }
  // bond = a REAL payment to the treasury on Solana: native SOL, or USDC / USDT as an SPL transfer.
  // The server reads the confirmed transaction, credits the on-chain amount and never credits a signature twice.
  if (req.method === 'POST' && u === '/api/bond') {
    const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'bad wallet' });
    if (PAUSED) return json(res, 200, { error: 'bonds are paused — do not send funds to the treasury' });
    if (!TREASURY_WALLET) return json(res, 200, { error: 'bonds are not open yet' });
    const m = BONDS.find((x) => x.id === d.market); if (!m) return json(res, 200, { error: 'bad market' });
    if (!isSig(d.tx)) return json(res, 200, { error: 'missing payment signature — a bond pays the treasury first' });
    if (db.bondTx.includes(d.tx) || db.stakeTx.includes(d.tx)) return json(res, 200, { error: 'this payment was already credited' });
    let p; try { p = await readPayment(d.tx, d.wallet, m.asset); } catch (e) { return json(res, 200, { error: errMsg(e, 'could not verify payment — try again in a moment') }); }
    const amt = p.amount;
    if (!(amt > 0)) return json(res, 200, { error: 'no ' + m.name + ' moved from your wallet to the treasury in this transaction' });
    if (amt < m.min) return json(res, 200, { error: 'below the ' + m.min + ' ' + m.name + ' minimum — this payment was ' + amt + ' ' + m.name + ' and was not credited' });
    const usd = amt * assetUsd(m), price = tokenPrice(); if (!(usd > 0) || !(price > 0)) return json(res, 200, { error: 'price feed unavailable — try again in a minute' });
    if (db.bondTx.includes(d.tx)) return json(res, 200, { error: 'this payment was already credited' });
    const payout = usd / (price * (1 - m.discount)); const w = W(d.wallet); const now = Date.now();
    w.bonds.push({ market: m.name, paid: amt, usd, tx: d.tx, payout, start: now, end: now + m.vestDays * 86400000, claimed: 0, done: false });
    db.bondTx.push(d.tx); tapePush('bond', d.wallet, payout); db.tape[0].tx = d.tx; db.treasury += usd; save(); pollTreasury();
    return json(res, 200, { ok: true, paid: amt, usd, payout, ...account(d.wallet) });
  }
  if (req.method === 'POST' && u === '/api/claim') {
    const d = await body(req); if (!isWallet(d.wallet)) return json(res, 200, { error: 'bad wallet' });
    try { requireSess(d.wallet, d.auth); } catch (e) { return json(res, 200, { error: errMsg(e, 'sign in again'), auth: true }); }
    const w = W(d.wallet); const now = Date.now(); let claimed = 0; const autostake = !!d.autostake;
    for (const b of w.bonds) { if (b.done) continue; const pct = Math.max(0, Math.min(1, (now - b.start) / (b.end - b.start))); const c = b.payout * pct - b.claimed; if (c > 0) { b.claimed += c; claimed += c; } if (pct >= 1) b.done = true; }
    if (claimed > 0) { if (autostake) { const idx = liveIndex(); const ag = claimed / idx; w.agons += ag; db.totalAgons += ag; tapePush('stake', d.wallet, claimed); } else db.withdrawals.push({ wallet: d.wallet, amount: +claimed.toFixed(4), kind: 'bond-claim', status: 'pending', t: Date.now() }); save(); }
    return json(res, 200, { ok: true, claimed, autostake, ...account(d.wallet) });
  }
  serve(req, res);
});

function start() {
  pollSol(); setInterval(pollSol, 30000).unref();
  pollPrice(); setInterval(pollPrice, 60000).unref();
  pollTreasury(); setInterval(pollTreasury, 20000).unref();
  setInterval(() => { if (Date.now() - db.lastRebase >= REBASE_SEC * 1000) rebase(); }, 1000).unref();
  process.on('SIGTERM', () => { saveNow(); process.exit(0); });
  return server.listen(PORT, () => console.log('sOHM on Solana · :' + PORT + ' · rebase ' + REBASE_SEC + 's' + (TREASURY_WALLET ? '' : ' · TREASURY_WALLET not set (bonds closed)')));
}
if (require.main === module) start();
module.exports = { start, server, readPayment, sessionMsg, b58dec, isWallet, isSig, saveNow };
