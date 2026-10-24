const {withPage}=require('./qa.js');
const [vw,vh,lang,extra]=[+process.argv[2],+process.argv[3],process.argv[4]||'en',process.argv[5]||''];
const tag=`${lang}_${vw}x${vh}`;
withPage(vw,vh,`photo=1&lang=${lang}&${extra}`,async(p,errs)=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await wait(800);
  const measure=(sel)=>p.evaluate((sel)=>{const W=innerWidth,H=innerHeight;const out=[];document.querySelectorAll(sel).forEach(el=>{const r=el.getBoundingClientRect();if(r.width&&(r.right>W+1||r.left<-1))out.push({cls:el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className,l:Math.round(r.left),r:Math.round(r.right),W})});return out},sel);
  await p.screenshot({path:`/tmp/h/qa/${tag}_1_envelope.png`});
  const envOver=await measure('.cn-stage *');
  const envFit=await p.evaluate(()=>{const e=document.querySelector('.cn-float').getBoundingClientRect(),h=document.querySelector('.cn-head').getBoundingClientRect(),t=document.querySelector('.cn-hint').getBoundingClientRect();return{headTop:Math.round(h.top),envW:Math.round(e.width),envPct:Math.round(e.width/innerWidth*100),hintBottom:Math.round(t.bottom),H:innerHeight}});
  await p.evaluate(()=>document.querySelector('[data-seal]').click());
  await wait(1700);await p.screenshot({path:`/tmp/h/qa/${tag}_2_opening.png`});
  await p.waitForFunction('window.__done',{timeout:15000});
  await wait(5200); // let the cover choreography play out
  await p.screenshot({path:`/tmp/h/qa/${tag}_3_cover.png`});
  const over=await measure('.cn-cover *, .cn-top *');
  const fit=await p.evaluate(()=>{
    const H=innerHeight,W=innerWidth;const q=s=>document.querySelector(s);const rect=s=>{const e=q(s);if(!e)return null;const r=e.getBoundingClientRect();return{top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)}};
    const main=q('.cn-cmain'),blocks=[...document.querySelectorAll('.cn-cmain>div')].map(e=>{const r=e.getBoundingClientRect();return{c:e.className,top:Math.round(r.top),bottom:Math.round(r.bottom)}});
    const topbar=rect('.cn-top .cn-logo'),firstText=rect('.cn-ctitle')||rect('.cn-crest');
    return{H,W,scrollW:document.documentElement.scrollWidth,mainScroll:main.scrollHeight,mainClient:main.clientHeight,blocks,topbarLogo:topbar,firstContentTop:firstText&&firstText.top,lastBottom:Math.max(...blocks.map(b=>b.bottom))}});
  console.log(JSON.stringify({tag,consoleErrors:errs.filter(e=>!/404/.test(e)),envOverflow:envOver,envFit,coverOverflow:over,fit},null,0));
});
