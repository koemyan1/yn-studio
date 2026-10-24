const http=require('http'),fs=require('fs'),path=require('path');
const root=require('child_process').execSync('npm root -g').toString().trim();
const puppeteer=require(path.join(root,'@mermaid-js/mermaid-cli/node_modules/puppeteer'));
const CHROME='/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const srv=http.createServer((q,r)=>{const f=path.join('/tmp/h',decodeURIComponent(q.url.split('?')[0].replace(/^\/$/,'/index.html')));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});r.end(d)})});
async function withPage(vw,vh,qs,fn){
  await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
  const b=await puppeteer.launch({headless:'new',executablePath:CHROME,args:['--no-sandbox','--disable-setuid-sandbox']});
  const p=await b.newPage();const errs=[];
  p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())});p.on('pageerror',e=>errs.push('pageerror: '+e.message));
  await p.setViewport({width:vw,height:vh,deviceScaleFactor:vw<500?2:1,isMobile:vw<500,hasTouch:vw<500});
  await p.goto(`http://localhost:${port}/?${qs}`);await p.waitForFunction('window.__ready');
  try{await fn(p,errs)}finally{await b.close();srv.close()}
}
module.exports={withPage};
if(require.main===module){
 const [vw,vh,qs,out]=[+process.argv[2],+process.argv[3],process.argv[4]||'',process.argv[5]||'/tmp/h/out.png'];
 withPage(vw,vh,qs,async(p,errs)=>{await new Promise(r=>setTimeout(r,700));await p.screenshot({path:out});console.log('errors:',errs)});
}
