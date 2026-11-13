// writes brand/X-KIT.md and checks every tweet is ≤245 characters.  node _studio/tweets.cjs
// Voice: the mint. Banknote and bond-window imagery, plain confident sentences, second person.
// No numbered how-to lists, no tick-box lists, no fork roll-calls (those belong to the eOHM kit).
'use strict';
const fs = require('fs'), path = require('path'), len = (s) => [...s].length;
const SITE = 'https://solanaohm.xyz', LINK = new Set(['Key art', 'Rebase (video)', 'Getting started (video)', 'Getting started', 'Treasury', 'Launch (fill CA)']);
const HANDLE = '@SolanaOHM', NAME = 'Solana OHM | $sOHM';
const BIO = 'The (3,3) reserve of Solana. Stake to compound every 5 minutes. Bond SOL, USDT or USDC under market, every payment checked on-chain. $sOHM';
const DEX = 'sOHM is the OHM-style (3,3) reserve currency of Solana. Stake sOHM to receive stOHM, which grows at every rebase, 288 times a day. Bond SOL, USDT or USDC to buy sOHM at 5 to 7% under the market price, vesting in a straight line over five days. Every stake and bond is a real Solana transaction that is read back from the chain before anything is credited, and each transaction counts once. Bond payments fill a treasury whose SOL, USDC and USDT balances are read from Solana every 20 seconds and shown live in the app. Fixed supply of 1,000,000,000. Connect with Phantom.';
const T = [
['Pinned · hype (video)', 'sohm-hype-14s.mp4', `A banknote earns trust from its engraving: fine lines that are hard to copy.

sOHM earns it another way. Every payment into the reserve is checked against Solana before a single token is credited.

The (3,3) reserve of Solana.

$sOHM`],
['Key art', 'sohm-g01-keyart.png', `Meet sOHM.

A reserve currency for Solana with two doors. Stake, and your balance grows every five minutes. Bond, and you buy in under the market price while the treasury fills.

$sOHM`],
['The note', 'sohm-g02-note.png', `If sOHM were printed, this is the note.

One billion in the series and not one more. Accepted at the bond window in SOL, USDT and USDC. Compounded every five minutes for anyone who stakes it.

$sOHM`],
['Rebase (video)', 'sohm-rebase-12s.mp4', `Watch one position for a few epochs.

1,000,000 stOHM. Five minutes pass, the index ticks, and about 74 more appear. Then again. And again, 288 times before tomorrow.

$sOHM`],
['Staking', 'sohm-g03-stake.png', `You don't claim staking rewards on sOHM. There's nothing to click.

Your stOHM balance simply gets larger at every rebase, at the same moment as everyone else's. At the current rate that comes to about 2.2% a day.

$sOHM`],
['Bond (video)', 'sohm-bond-13s.mp4', `The bond window, start to finish.

You send 1 SOL. It settles in the treasury. The transaction is read back from Solana. You're credited sOHM priced 7% under market, unlocking evenly across five days.

$sOHM`],
['Bond markets', 'sohm-g04-bonds.png', `Pick your window.

SOL gets you sOHM at 7% under market. USDT, 6%. USDC, 5%.

Whichever you choose, it unlocks in a straight line over five days, and what's unlocked can roll into staking without leaving the protocol.

$sOHM`],
['Verification', 'sohm-g05-verify.png', `We don't ask you to tell us what you paid.

The app sends only a transaction signature. The confirmed transaction is pulled from Solana, and you're credited what actually reached the treasury. Each signature counts one time.

$sOHM`],
['(3,3) (video)', 'sohm-33-12s.mp4', `Nine squares, two players.

Sell together and both lose. Sell alone and the other holder eats it. Stake together and both balances climb.

Olympus named that last square (3,3). It still describes the whole game.

$sOHM`],
['Payoff grid', 'sohm-g06-matrix.png', `The grid behind the ticker.

Staking helps you and the next holder. Bonding helps you and the treasury. Selling helps you a little and costs someone else.

The protocol is built to pay the first two.

$sOHM`],
['Compounding (video)', 'sohm-compound-12s.mp4', `Thirty days, one position, no deposits after the first.

1,000,000 stOHM becomes 1,901,542 at the current rate. Nothing dramatic happens on any single day. It's 8,640 small rebases stacked on each other.

$sOHM`],
['Compounding curve', 'sohm-g07-compound.png', `Day 1: +2.2%. Day 7: +16.2%. Day 30: +90.2%.

Same rate the whole way. The curve bends because each rebase pays out on the stOHM the previous one added.

$sOHM`],
['Getting started (video)', 'sohm-start-15s.mp4', `Getting into sOHM is three steps in Phantom.

Sign a free message to prove the wallet is yours. Send SOL for your bond. Then, as it vests, press claim and stake.

No forms. No account.

$sOHM`],
['Getting started', 'sohm-g08-start.png', `New here? Start at the bond window, not the market.

Bonding SOL prices your sOHM 7% under market. Staking it afterwards puts it on the five-minute rebase. One click joins the two.

$sOHM`],
['Treasury', 'sohm-g09-treasury.png', `Where does bond money go? One treasury on Solana.

The dashboard reads its SOL, USDC and USDT balances from the chain every 20 seconds, so the figure you see is a live reading and never a typed-in number.

$sOHM`],
['Market cap', 'sohm-g11-compare.png', `Two circles and a dot.

The large circle is Olympus at its peak: $4.35B. The second is Wonderland: $2.08B. The dot is sOHM on day one, at the pump.fun opening price.

To true scale, the dot would be too small to print.

$sOHM`],
['Launch (fill CA)', 'sohm-g10-live.png', `$sOHM is live on Solana, and staking just opened.

Stake to join the five-minute rebase. Bond SOL, USDT or USDC to buy under market.

CA:

$sOHM`],
];
let md = `# sOHM X kit\n\n## Handle\n\`\`\`\n${HANDLE}\n\`\`\`\n\n## Display name\n\`\`\`\n${NAME}\n\`\`\`\n\n## Bio (${len(BIO)}/160)\n\`\`\`\n${BIO}\n\`\`\`\n\n## DexScreener description\n\`\`\`\n${DEX}\n\`\`\`\n\n## Website\n\`\`\`\n${SITE}\n\`\`\`\n\n## Profile images\n- Avatar: \`sohm-pfp.png\`\n- Header: \`sohm-banner.png\`\n- Share image: \`sohm-og.png\`\n\n## Tweets (all ≤245)\n`;
let bad = 0; T.forEach(([title, media, text0], i) => { const tail = '\n\n$sOHM', text = LINK.has(title) && text0.endsWith(tail) ? text0.slice(0, -tail.length) + '\n\n' + SITE + tail : text0, n = len(text); if (n > 245) { bad++; console.log('TOO LONG', title, n); } if (!fs.existsSync(path.join(__dirname, '..', 'brand', media))) console.log('MISSING MEDIA', media); md += `\n### ${i + 1}. ${title} · ${n} chars · media: \`${media}\`\n\`\`\`\n${text}\n\`\`\`\n`; console.log(String(n).padStart(4), title); });
if (len(BIO) > 160) { bad++; console.log('BIO TOO LONG', len(BIO)); }
if (/Q4yNAb/.test(md)) { bad++; console.log('TREASURY ADDRESS IN KIT'); }
fs.writeFileSync(path.join(__dirname, '..', 'brand', 'X-KIT.md'), md); console.log(T.length, 'tweets', bad ? 'FAILED' : 'ok', 'bio', len(BIO)); process.exit(bad ? 1 : 0);
