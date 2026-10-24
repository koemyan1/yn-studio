const {withPage}=require('./qa.js');const fs=require('fs');
const [vw,vh,qs,tag]=[+process.argv[2],+process.argv[3],process.argv[4]||'',process.argv[5]||'flow'];
withPage(vw,vh,qs,async(p,errs)=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await wait(500);
  await p.evaluate(()=>document.querySelector('[data-seal]').click());
  await p.waitForFunction('window.__done',{timeout:15000});
  await wait(1500);
  fs.mkdirSync('/tmp/h/flow',{recursive:true});
  // scroll the inner scroller section by section and shoot each stop
  const stops=await p.evaluate(()=>{const sc=document.querySelector('.cn-scroller');return {total:sc.scrollHeight,vh:sc.clientHeight}});
  const n=Math.ceil(stops.total/stops.vh);
  console.log('scrollHeight',stops.total,'viewport',stops.vh,'screens',n);
  let i=0;
  for(let y=0;y<stops.total;y+=Math.round(stops.vh*0.9)){
    await p.evaluate(y=>{const sc=document.querySelector('.cn-scroller');sc.style.scrollBehavior='auto';sc.scrollTop=y},y);
    await wait(450);
    await p.screenshot({path:`/tmp/h/flow/${tag}_${String(i++).padStart(2,'0')}.png`});
  }
  const over=await p.evaluate(()=>{const W=innerWidth;const bad=[];document.querySelectorAll('.cn-scroller *, .cn-top *').forEach(el=>{if(el.closest('.cn-marq,.cn-cphoto,.cn-candleImg,.cn-lanterns,.cn-track'))return;const r=el.getBoundingClientRect();if(r.width&&(r.right>W+2||r.left<-2))bad.push((el.className.baseVal??el.className)+' '+Math.round(r.left)+'..'+Math.round(r.right))});return bad.slice(0,8)});
  const sw=await p.evaluate(()=>({docW:document.documentElement.scrollWidth,W:innerWidth,scrollerW:document.querySelector('.cn-scroller').scrollWidth}));
  console.log(JSON.stringify({shots:i,overflow:over,sw,errors:errs.filter(e=>!/404/.test(e))}));
});
