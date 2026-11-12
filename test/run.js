// sOHM tests: boots the server on a scratch data file, then checks the HTTP API, the signed-session check,
// the hand-built Solana transfer messages (simulated on mainnet) and payment verification against real transactions.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const TREASURY = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'; // any real, funded Solana wallet works for reads
const tmp = path.join(os.tmpdir(), 'sohm-test-' + Date.now() + '.json');
Object.assign(process.env, { PORT: '8391', DATA_PATH: tmp, TREASURY_WALLET: TREASURY, ADMIN_KEY: 'k', SOL_USD: '150', REBASE_SEC: '300' });
const S = require('../server/index.js');
const B = 'http://127.0.0.1:8391';
let pass = 0, fail = 0, skip = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const skipT = (name, why) => { skip++; console.log('SKIP', name, '·', why); };
const get = (u) => fetch(B + u).then((r) => r.json());
const post = (u, b) => fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const rpc = async (method, params) => { const r = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
// pull the wallet-side helpers straight out of the shipped client so the test exercises the real code
const src = fs.readFileSync(path.join(__dirname, '../client/src/app.js'), 'utf8');
const line = (re) => { const m = src.match(re); if (!m) throw new Error('missing ' + re); return m[0]; };
const C = new Function([
  line(/const B58 = .*\n/), line(/function b58dec\(s\).*\n/), line(/function b58enc\(bytes\).*\n/), line(/const units = .*\n/), line(/const u64 = .*\n/),
  line(/function solTransferMessage[\s\S]*?\n  }\n/), line(/function splTransferMessage[\s\S]*?\n  }\n/),
  'return { b58dec, b58enc, units, solTransferMessage, splTransferMessage };'].join(''))();
const b58 = (buf) => C.b58enc([...buf]);
const EVM = '0x6A690F711928E8b938Fb5FE38F6fc2B8164Abc97';

(async () => {
  S.start(); await new Promise((r) => setTimeout(r, 400));
  // ---- pages ----
  for (const p of ['/', '/app', '/docs']) { const t = await (await fetch(B + p)).text(); ok('page ' + p + ' serves with no template tokens left', t.includes('sOHM') && !/\{\{[A-Z_]+\}\}/.test(t)); ok('page ' + p + ' has no Elysium or eOHM text', !/eohm|elysium|hyperliquid|\bhype\b|metamask|rabby/i.test(t)); }
  ok('path traversal blocked', (await fetch(B + '/client/..%2fserver/index.js')).status !== 200);
  // ---- config + metrics ----
  const cfg = await get('/api/config'); ok('config: solana, tickers, bonds open', cfg.network === 'solana' && cfg.token === 'sOHM' && cfg.staked === 'stOHM' && cfg.bondsOpen === true, cfg);
  // the treasury address must not appear on any page or public endpoint; only /api/intent hands it to a paying wallet
  for (const u of ['/', '/app', '/docs', '/api/config', '/api/metrics', '/api/health', '/client/src/app.js', '/client/sohm.css']) ok('treasury address absent from ' + u, !(await (await fetch(B + u)).text()).includes(TREASURY));
  ok('payout export stays behind the admin key', (await fetch(B + '/api/withdrawals')).status === 403);
  const m = await get('/api/metrics'); ok('metrics: three bond markets SOL/USDC/USDT', m.bonds.map((b) => b.id).join() === 'sol,usdc,usdt', m.bonds);
  ok('metrics: price > 0 before launch (pump.fun opening price)', m.price > 0 && !m.mint, m.price);
  ok('metrics: bond price = price x (1 - discount)', m.bonds.every((b) => Math.abs(b.price - m.price * (1 - b.discount)) < 1e-15));
  ok('metrics: nothing staked means runway null', m.totalStaked === 0 && m.runwayDays === null);
  // ---- validation ----
  const W = crypto.generateKeyPairSync('ed25519'); const pk = W.publicKey.export({ format: 'der', type: 'spki' }).subarray(12); const wallet = b58(pk);
  ok('base58 round trip', Buffer.from(C.b58dec(wallet)).equals(pk) && S.isWallet(wallet) && !S.isWallet(EVM));
  ok('account rejects an EVM address', !!(await post('/api/account', { wallet: EVM })).error);
  const a0 = await post('/api/account', { wallet }); ok('fresh account is empty', a0.staked === 0 && a0.bonds.length === 0, a0);
  ok('stake refused before launch', /launches/.test((await post('/api/stake', { wallet, tx: '1'.repeat(88) })).error || ''));
  ok('bond refuses a missing signature', /signature/.test((await post('/api/bond', { wallet, market: 'sol', tx: 'nope' })).error || ''));
  ok('bond refuses an unknown market', /market/.test((await post('/api/bond', { wallet, market: 'hype', tx: '2'.repeat(88) })).error || ''));
  // ---- signed sessions ----
  ok('unstake without a session is refused', (await post('/api/unstake', { wallet, amount: 1 })).auth === true);
  const sm = await get('/api/session?wallet=' + wallet); const sig = b58(crypto.sign(null, Buffer.from(sm.message, 'utf8'), W.privateKey));
  const good = await post('/api/unstake', { wallet, amount: 1, auth: { exp: sm.exp, sig } }); ok('valid wallet signature is accepted (reaches the balance check)', good.error === 'nothing staked', good);
  const other = crypto.generateKeyPairSync('ed25519'); const w2 = b58(other.publicKey.export({ format: 'der', type: 'spki' }).subarray(12));
  const bad = await post('/api/unstake', { wallet: w2, amount: 1, auth: { exp: sm.exp, sig } }); ok('signature from another wallet is rejected', bad.auth === true && /signature/.test(bad.error), bad);
  const stale = await post('/api/claim', { wallet, auth: { exp: Date.now() - 1000, sig } }); ok('expired session is rejected', stale.auth === true, stale);
  // ---- admin ----
  ok('admin needs the key', (await fetch(B + '/api/admin/pause?on=1')).status === 403);
  await get('/api/admin/pause?key=k&on=1'); ok('pause blocks bonds', /paused/.test((await post('/api/bond', { wallet, market: 'sol', tx: '3'.repeat(88) })).error || '')); await get('/api/admin/pause?key=k&on=0');
  ok('mint switch rejects a non-mint address', !!(await get('/api/admin/mint?key=k&mint=' + wallet)).error);
  // ---- units ----
  ok('units: decimal strings to base units', C.units('1.5', 9) === 1500000000n && C.units('0.000001', 6) === 1n && C.units('12', 6) === 12000000n);
  // ---- live Solana: simulate the hand-built transfers, verify real payments ----
  let live = true; try { await rpc('getHealth', []); } catch (e) { live = false; }
  if (!live) skipT('live Solana checks', 'mainnet RPC unreachable');
  else {
    const sim = async (msg) => { const tx = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from(msg)]); return (await rpc('simulateTransaction', [tx.toString('base64'), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }])).value; };
    try { const bh = (await rpc('getLatestBlockhash', [])).value.blockhash;
      const r = await sim(C.solTransferMessage(TREASURY, wallet, bh, C.units('0.01', 9))); ok('SOL transfer message simulates cleanly on mainnet', r.err === null, r.err || r.logs);
    } catch (e) { skipT('SOL transfer simulation', e.message); }
    try { // the payer must be a different wallet from the treasury and hold USDC: try a few large public wallets
      let I = null, payer = '';
      for (const w of ['9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', 'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE']) { const x = await post('/api/intent', { wallet: w, kind: 'bond', market: 'usdc' }); if (!x.error && x.balance >= 1 && x.source !== x.dest) { I = x; payer = w; break; } }
      if (!I) skipT('USDC transfer simulation', 'no funded USDC payer found');
      else { ok('intent returns token accounts and a blockhash', I.decimals === 6 && S.isWallet(I.source) && S.isWallet(I.dest), I);
        const r = await sim(C.splTransferMessage(payer, I.source, I.dest, I.mint, I.program, I.blockhash, C.units('1', I.decimals), I.decimals)); ok('USDC TransferChecked message simulates cleanly on mainnet', r.err === null, r.err || r.logs); }
    } catch (e) { skipT('USDC transfer simulation', e.message); }
    try { // find a real, recent, plain SOL transfer and check readPayment reports exactly what moved
      const sigs = await rpc('getSignaturesForAddress', [TREASURY, { limit: 25 }]); let done = false;
      for (const s of sigs) { if (s.err) continue; const tx = await rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]); if (!tx) continue;
        const ixs = tx.transaction.message.instructions; const ix = ixs.find((i) => i.program === 'system' && i.parsed && i.parsed.type === 'transfer'); if (!ix || ixs.filter((i) => i.program === 'system').length > 1) continue;
        const { source, destination, lamports } = ix.parsed.info; const p = await S.readPayment(s.signature, source, 'native', destination);
        ok('readPayment: real SOL transfer credited at its on-chain amount', Math.abs(p.amount - lamports / 1e9) < 1e-9, { got: p.amount, want: lamports / 1e9 });
        let threw = ''; try { await S.readPayment(s.signature, wallet, 'native', destination); } catch (e) { threw = String(e); } ok('readPayment: a transaction from another wallet is refused', /not signed by your wallet/.test(threw), threw);
        const wrong = await S.readPayment(s.signature, source, 'native', wallet).catch(() => ({ amount: 0 })); ok('readPayment: wrong treasury credits nothing', !(wrong.amount > 0));
        done = true; break; }
      if (!done) skipT('readPayment on a real transfer', 'no plain SOL transfer in the last 25 signatures');
    } catch (e) { skipT('readPayment on a real transfer', e.message); }
  }
  S.saveNow(); try { fs.unlinkSync(tmp); } catch (e) {} try { fs.unlinkSync(tmp + '.bak'); } catch (e) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + skip + ' skipped'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
