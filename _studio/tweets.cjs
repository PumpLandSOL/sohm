// writes brand/X-KIT.md and checks every tweet is ≤245 characters.  node _studio/tweets.cjs
// Voice (v2, 2026-11-15, user: "more bullish, compare to previous OHM forks"): the 2021 playbook returning on Solana. Sourced fork peaks, direct sentences.
// Fork comparisons are allowed here, but in sentences: no bare roll-call lists (that format belongs to the eOHM kit).
'use strict';
const fs = require('fs'), path = require('path'), len = (s) => [...s].length;
const SITE = 'https://solanaohm.xyz', LINK = new Set(['Key art', 'Rebase (video)', 'Getting started (video)', 'Getting started', 'Treasury', 'Launch (fill CA)']);
const HANDLE = '@SolanaOHM', NAME = 'Solana OHM | $sOHM';
const BIO = '(3,3) on Solana. OHM hit $4.35B on Ethereum, TIME $2.08B on Avalanche. This is Solana\'s reserve: 288 rebases a day, SOL bonds 7% under market. $sOHM';
const DEX = 'sOHM is the OHM-style (3,3) reserve currency of Solana. Stake sOHM to receive stOHM, which grows at every rebase, 288 times a day. Bond SOL, USDT or USDC to buy sOHM at 5 to 7% under the market price, vesting in a straight line over five days. Every stake and bond is a real Solana transaction that is read back from the chain before anything is credited, and each transaction counts once. Bond payments fill a treasury whose SOL, USDC and USDT balances are read from Solana every 20 seconds and shown live in the app. Fixed supply of 1,000,000,000. Connect with Phantom.';
const T = [
['Pinned · hype (video)', 'sohm-hype-14s.mp4', `Olympus went from zero to $4.35B on one idea: (3,3).

Wonderland took the same idea to Avalanche and hit $2.08B.

Now it's Solana's turn, with rebases every five minutes instead of every eight hours.

sOHM is open.

$sOHM`],
['Key art', 'sohm-g01-keyart.png', `(3,3) is back, and this time it lives on Solana.

Stake sOHM and your balance compounds every five minutes. Bond SOL and buy in 7% under market. It's the game that built a $4.35B protocol, on a faster chain.

$sOHM`],
['The note', 'sohm-g02-note.png', `TIME was Avalanche's OHM. KLIMA was Polygon's. HEC was Fantom's.

sOHM is Solana's: one billion supply, fixed forever, launching on pump.fun where every buyer starts on the same curve.

$sOHM`],
['Rebase (video)', 'sohm-rebase-12s.mp4', `Olympus paid its stakers three times a day, and that was enough to carry it to $4.35B.

sOHM pays 288 times a day. Every five minutes the index steps up and every staked balance grows with it.

$sOHM`],
['Staking', 'sohm-g03-stake.png', `250,000% APY sounds like 2021 because it is the 2021 design.

On sOHM that works out to about 2.2% a day, paid in sOHM and compounded every five minutes without you touching a thing.

Stakers are the whole point.

$sOHM`],
['Bond (video)', 'sohm-bond-13s.mp4', `The old OHM hands rarely bought the market. They bonded.

On sOHM a bond is SOL in and sOHM out at 7% under market, unlocked across five days. Every one of them makes the treasury bigger.

$sOHM`],
['Bond markets', 'sohm-g04-bonds.png', `Why pay market price?

SOL bonds price sOHM 7% lower. USDT bonds, 6%. USDC bonds, 5%.

Each bond fills the treasury behind the token. That loop is what took Olympus and Wonderland into the billions.

$sOHM`],
['Verification', 'sohm-g05-verify.png', `In 2021 you took a fork's dashboard on faith.

sOHM reads every payment back from Solana before crediting it, and reads its treasury from the chain every 20 seconds. What the app shows is what the chain holds.

$sOHM`],
['(3,3) (video)', 'sohm-33-12s.mp4', `Remember when half of crypto Twitter had (3,3) in their name?

It was a strategy, not a joke: if nobody sells, everybody compounds. It built an $8 billion sector in 2021.

Time to put it back in your name.

$sOHM`],
['Payoff grid', 'sohm-g06-matrix.png', `This grid is why OHM forks ran as hard as they did.

Staking pays you and the holder next to you. Selling pays a little and costs everyone else. Once a community sees that, supply stops reaching the market.

$sOHM`],
['Compounding (video)', 'sohm-compound-12s.mp4', `Stake 1,000,000 sOHM and leave it alone for a month.

At the current rate you're holding 1,901,542. That's +90% in sOHM from sitting still, and it's why (3,3) holders sat still in 2021.

$sOHM`],
['Compounding curve', 'sohm-g07-compound.png', `+2.2% in a day. +16.2% in a week. +90.2% in a month.

That's the sOHM staking curve at the current rate, compounding 288 times a day. The earlier you stake, the more rebases you catch.

$sOHM`],
['Getting started (video)', 'sohm-start-15s.mp4', `At the top of 2021, Olympus and its forks were worth $8.03B combined.

Getting into Solana's version takes a minute: connect Phantom, bond SOL, then claim and stake.

$sOHM`],
['Getting started', 'sohm-g08-start.png', `The cheapest sOHM is at the bond window, 7% under whatever the market says.

Bond SOL, stake it as it vests, and you're on the five-minute rebase before most people have found the chart.

$sOHM`],
['Treasury', 'sohm-g09-treasury.png', `Every OHM fork lived or died by its treasury.

sOHM's is one wallet on Solana, and the app reads its SOL, USDC and USDT straight from the chain every 20 seconds. Bonds fill it. Watch it grow.

$sOHM`],
['Market cap', 'sohm-g11-compare.png', `Olympus peaked at a $4.35B market cap. Wonderland peaked at $2.08B. The whole (3,3) sector touched $8.03B.

sOHM is the dot at the bottom of that chart, on day one.

$sOHM`],
['App demo (video)', 'sohm-app-demo.mp4', `No waitlist and no "coming soon". This is sOHM running on Solana right now.

Live APY, live treasury, and a real bond quote: 1 SOL gets you sOHM at 7% under market.

${SITE}

$sOHM`],
['The sector', 'sohm-g12-sector.png', `At the top of the last cycle, (3,3) was an $8.03B sector.

Olympus was $4.35B of it. Wonderland was $2.08B. Every other fork split what was left.

The sector starts over this cycle, and Solana's entry is sOHM.

$sOHM`],
['The math', 'sohm-g13-ladder.png', `Run the numbers on Olympus' $4.35B peak.

1% of it is a $43.5M market cap. 10% of it is $435M.

sOHM opens at the very bottom of the pump.fun curve. That's the whole pitch.

$sOHM`],
['Launch to peak', 'sohm-g14-speed.png', `Wonderland launched in September 2021 and was a $2.08B protocol by November.

Olympus reached $4.35B inside its first year.

(3,3) doesn't move slowly when it moves. sOHM is on day one.

$sOHM`],
['(3,3) in your name', 'sohm-g15-33.png', `The quickest way to spot who's early is to check the name.

(3,3) next to a handle meant you were staked and not selling. It's how a $4.35B community recognised its own.

sOHM stakers, you know what to do.

$sOHM`],
['The bond edge', 'sohm-g16-edge.png', `$1,000 of SOL at the sOHM bond window comes back as $1,075 of sOHM.

That's the 7% discount doing its job. It unlocks over five days, and every dollar of your SOL lands in the treasury behind the token.

$sOHM`],
['Launch (fill CA)', 'sohm-g10-live.png', `$sOHM is live on Solana.

OHM peaked at $4.35B. TIME peaked at $2.08B. This one starts today, at the pump.fun opening price.

Staking is open. Bonds are open. (3,3).

CA:

$sOHM`],
];
let md = `# sOHM X kit\n\n## Handle\n\`\`\`\n${HANDLE}\n\`\`\`\n\n## Display name\n\`\`\`\n${NAME}\n\`\`\`\n\n## Bio (${len(BIO)}/160)\n\`\`\`\n${BIO}\n\`\`\`\n\n## DexScreener description\n\`\`\`\n${DEX}\n\`\`\`\n\n## Website\n\`\`\`\n${SITE}\n\`\`\`\n\n## Profile images\n- Avatar: \`sohm-pfp.png\`\n- Header: \`sohm-banner.png\`\n- Share image: \`sohm-og.png\`\n\n## Tweets (all ≤245)\n`;
let bad = 0; T.forEach(([title, media, text0], i) => { const tail = '\n\n$sOHM', text = LINK.has(title) && text0.endsWith(tail) ? text0.slice(0, -tail.length) + '\n\n' + SITE + tail : text0, n = len(text); if (n > 245) { bad++; console.log('TOO LONG', title, n); } if (!fs.existsSync(path.join(__dirname, '..', 'brand', media))) console.log('MISSING MEDIA', media); md += `\n### ${i + 1}. ${title} · ${n} chars · media: \`${media}\`\n\`\`\`\n${text}\n\`\`\`\n`; console.log(String(n).padStart(4), title); });
if (len(BIO) > 160) { bad++; console.log('BIO TOO LONG', len(BIO)); }
if (/Q4yNAb/.test(md)) { bad++; console.log('TREASURY ADDRESS IN KIT'); }
fs.writeFileSync(path.join(__dirname, '..', 'brand', 'X-KIT.md'), md); console.log(T.length, 'tweets', bad ? 'FAILED' : 'ok', 'bio', len(BIO)); process.exit(bad ? 1 : 0);
