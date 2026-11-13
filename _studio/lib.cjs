// shared look for the sOHM kit: engraved-note page head, mark, lace rule, and a seekable guilloché rosette
'use strict';
const X = '@SolanaOHM', TICK = '$sOHM', SITE = 'solanaohm.xyz';
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">`;
const MARK = (s = 40) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#050308"/><circle cx="32" cy="32" r="29.5" fill="none" stroke="#9b6dff" stroke-width="1"/><circle cx="32" cy="32" r="26" fill="none" stroke="#cdb8ff" stroke-width="2.2" stroke-dasharray=".6 3.48" stroke-linecap="round"/><path d="M17 46.5h11.5v-5.2c-5.2-2.6-8.3-7.6-8.3-13.4C20.2 20.3 25.3 15 32 15s11.8 5.3 11.8 12.9c0 5.800-3.1 10.8-8.3 13.4v5.2H47" fill="none" stroke="#cdb8ff" stroke-width="4" stroke-linejoin="round"/></svg>`;
const LACE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='18' viewBox='0 0 48 18'%3E%3Cg fill='none' stroke='%239b6dff' stroke-width='.7' opacity='.6'%3E%3Cpath d='M0 9c6-10 18-10 24 0s18 10 24 0'/%3E%3Cpath d='M0 9c6 10 18 10 24 0s18-10 24 0'/%3E%3Cpath d='M-12 9c6-10 18-10 24 0s18 10 24 0s18-10 24 0'/%3E%3Cpath d='M-12 9c6 10 18 10 24 0s18-10 24 0s18 10 24 0'/%3E%3Cpath d='M0 9h48' opacity='.5'/%3E%3C/g%3E%3C/svg%3E")`;
const CSS = (W, H) => `*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#050308;color:#f2edfc;font:400 26px/1.5 'Instrument Sans',sans-serif;-webkit-font-smoothing:antialiased}
#cv{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
.cap{font:400 17px 'DM Mono',monospace;letter-spacing:.3em;text-transform:uppercase;color:#9b6dff}.cap.d{color:#72668f}
.h{font:400 104px/1 'Fraunces',serif;letter-spacing:-.035em;color:#f2edfc}.h em,.it{font-style:italic;color:#cdb8ff}
.ser{font-family:'Fraunces',serif}.mono{font-family:'DM Mono',monospace}.dim{color:#ab9fc6}.mut{color:#72668f}.lil{color:#cdb8ff}.hot{color:#f0a6ff}
.wm{font:italic 400 300px/.86 'Fraunces',serif;letter-spacing:-.045em;background:linear-gradient(180deg,#fff 20%,#cdb8ff 60%,#8a5cf5);-webkit-background-clip:text;background-clip:text;color:transparent;padding:0 .06em .08em}
.lace{position:absolute;left:0;right:0;height:18px;background:${LACE} repeat-x center;border-top:1px solid #22163a;border-bottom:1px solid #22163a}
.fr{position:absolute;border:1px solid #2c1d4d;background:linear-gradient(180deg,rgba(16,10,26,.92),rgba(7,5,12,.92))}
.fr:before,.fr:after{content:'';position:absolute;width:14px;height:14px;border:1px solid #9b6dff;pointer-events:none}.fr:before{left:-1px;top:-1px;border-right:0;border-bottom:0}.fr:after{right:-1px;bottom:-1px;border-left:0;border-top:0}
.rw{display:flex;justify-content:space-between;align-items:baseline;gap:30px;padding:18px 0;border-bottom:1px solid #22163a}.rw:last-child{border:0}
.foot{position:absolute;left:70px;right:70px;bottom:44px;display:flex;justify-content:space-between;align-items:center}
.mk{display:flex;align-items:center;gap:14px;font:italic 500 36px 'Fraunces',serif;letter-spacing:-.02em;color:#f2edfc}`;
const HEAD = (W, H, extra = '') => `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${CSS(W, H)}${extra}</style></head><body><canvas id="cv"></canvas>`;
const FOOT = () => `<div class="foot"><span class="mk">${MARK(44)}sOHM</span><span class="cap d">${SITE} · ${X} · <span style="color:#cdb8ff">${TICK}</span></span></div>`;
// the rosette, as a pure function of time so every frame is reproducible.
// rosette(g, {cx, cy, S, t, a (overall alpha), progress (rebase arc 0..1), text, reveal (0..1 bands drawn in), well (dark centre 0..1)})
const ROSETTE = `<script>
window.rosette=function(g,o){const cx=o.cx,cy=o.cy,S=o.S,t=o.t||0,A=o.a==null?1:o.a,rev=o.reveal==null?1:o.reveal;if(A<=0||rev<=0)return;
  const band=(R,amp,n,K,rot,m,wob,tt,alpha,lw,k0)=>{const steps=Math.max(360,n*30);g.lineWidth=lw;g.strokeStyle='rgba(155,109,255,'+(alpha*A).toFixed(3)+')';const part=Math.max(0,Math.min(1,(rev-k0)/(1-k0+1e-6)*1.6));if(part<=0)return;
    for(let k=0;k<K;k++){const ph=(k/K)*Math.PI*2;g.beginPath();const end=Math.floor(steps*part);for(let i=0;i<=end;i++){const th=(i/steps)*Math.PI*2,env=1-wob+wob*Math.sin(m*th+tt),r=R+amp*Math.sin(n*th+ph)*env,a=th+rot,x=cx+r*Math.cos(a),y=cy+r*Math.sin(a);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}};
  const rg=g.createRadialGradient(cx,cy,S*.1,cx,cy,S*1.05);rg.addColorStop(0,'rgba(120,70,255,'+(.22*A)+')');rg.addColorStop(.55,'rgba(90,40,200,'+(.07*A)+')');rg.addColorStop(1,'rgba(5,3,8,0)');g.fillStyle=rg;g.fillRect(cx-S*1.2,cy-S*1.2,S*2.4,S*2.4);
  const br=1+.06*Math.sin(t*.5);g.globalCompositeOperation='lighter';
  band(S*.955,S*.045,48,8,-t*.02,6,.25,t*.4,.34,.7,0);band(S*.70,S*.15*br,12,24,t*.03,3,.35,t*.3,.26,.7,.12);band(S*.70,S*.15*br,13,24,-t*.03,4,.35,-t*.25,.22,.7,.24);band(S*.36,S*.13,7,18,t*.05,2,.5,t*.6,.30,.7,.36);band(S*.185,S*.022,30,6,-t*.08,5,.2,t,.4,.7,.48);
  g.globalCompositeOperation='source-over';g.lineWidth=1;g.strokeStyle='rgba(155,109,255,'+(.3*A*Math.min(1,rev*2))+')';[.895,1.012,1.075].forEach((r)=>{g.beginPath();g.arc(cx,cy,S*r,0,Math.PI*2);g.stroke();});
  if(o.progress>0){g.lineWidth=Math.max(2,S*.006);g.strokeStyle='rgba(230,217,255,'+A+')';g.shadowColor='#9b6dff';g.shadowBlur=18;g.beginPath();g.arc(cx,cy,S*1.012,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,o.progress));g.stroke();g.shadowBlur=0;}
  if(o.text){const s=o.text,size=Math.max(9,S*.021),R=S*1.044;g.font='400 '+size+'px "DM Mono",monospace';g.fillStyle='rgba(205,184,255,'+(.62*A*Math.min(1,rev*2))+')';g.textAlign='center';g.textBaseline='middle';const adv=size*.92,n=Math.floor((Math.PI*2*R)/adv),da=(Math.PI*2)/n;for(let i=0;i<n;i++){const a=i*da-t*.02;g.save();g.translate(cx+R*Math.cos(a),cy+R*Math.sin(a));g.rotate(a+Math.PI/2);g.fillText(s[i%s.length],0,0);g.restore();}}
  if(o.well){const w=g.createRadialGradient(cx,cy,0,cx,cy,S*.52);w.addColorStop(0,'rgba(5,3,8,'+(.86*o.well)+')');w.addColorStop(.6,'rgba(5,3,8,'+(.5*o.well)+')');w.addColorStop(1,'rgba(5,3,8,0)');g.fillStyle=w;g.beginPath();g.arc(cx,cy,S*.52,0,Math.PI*2);g.fill();}};
window.RING_TEXT='SOHM · THE (3,3) RESERVE OF SOLANA · STAKE · BOND · COMPOUND · ';
window.cvInit=function(){const cv=document.getElementById('cv'),W=cv.clientWidth,H=cv.clientHeight,d=window.__dpr||1;cv.width=W*d;cv.height=H*d;const g=cv.getContext('2d');g.setTransform(d,0,0,d,0,0);return{g,W,H};};
window.fontsReady=function(){return Promise.all([document.fonts.load('400 20px "DM Mono"'),document.fonts.load('italic 400 40px "Fraunces"'),document.fonts.load('400 40px "Fraunces"'),document.fonts.load('500 20px "Instrument Sans"'),document.fonts.load('italic 500 40px "Fraunces"')]).then(()=>document.fonts.ready);};
</script>`;
module.exports = { X, TICK, SITE, FONTS, MARK, LACE, CSS, HEAD, FOOT, ROSETTE };
