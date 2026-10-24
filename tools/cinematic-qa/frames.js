const {withPage}=require('./qa.js');const fs=require('fs');const {execSync}=require('child_process');
const [vw,vh,qs,tag]=[+process.argv[2],+process.argv[3],process.argv[4]||'',process.argv[5]||'seq'];
const times=(process.argv[6]||'0,500,1000,1500,1900,2300,2900,3500,4100,4600,5100,5500,5900').split(',').map(Number);
withPage(vw,vh,qs,async(p,errs)=>{
  await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{document.querySelector('[data-seal]').click();document.getAnimations().forEach(a=>a.pause());});
  fs.mkdirSync('/tmp/h/fr',{recursive:true});
  for(let i=0;i<times.length;i++){
    await p.evaluate(t=>{document.getAnimations().forEach(a=>{a.currentTime=t})},times[i]);
    await new Promise(r=>setTimeout(r,60));
    await p.screenshot({path:`/tmp/h/fr/${tag}_${String(i).padStart(2,'0')}.png`});
  }
  console.log('errors:',errs.filter(e=>!/404/.test(e)));
});
