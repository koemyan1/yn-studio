import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Scissors,Trash2,Play,Pause,Download,Music,Type,ChevronLeft,ChevronRight} from 'lucide-react';
import {AvCfg,DEF,GESTURES,drawAvatar,AvatarPreview} from './avatar';

/* CapCut-style editor that runs entirely in the browser: clips on a timeline (trim, split, reorder, speed, volume, filters),
   text / emoji / avatar stickers, background music, 3 aspect ratios, and export to a video file (recorded in real time). */
type Clip={id:string;name:string;url:string;dur:number;inT:number;outT:number;speed:number;vol:number;filter:string;trans:string;td:number;key:{on:boolean;color:string;tol:number}};
type Cap={id:string;text:string;start:number;end:number};
type Ov={id:string;kind:'text'|'avatar';text:string;start:number;end:number;x:number;y:number;size:number;color:string};
const FILTERS:Record<string,string>={None:'none',Warm:'sepia(.35) saturate(1.3) contrast(1.05)',Cool:'hue-rotate(15deg) saturate(1.1) brightness(1.05)','B&W':'grayscale(1) contrast(1.1)',Vivid:'saturate(1.7) contrast(1.1)',Fade:'contrast(.85) brightness(1.1) saturate(.8)'};
const ASPECTS:Record<string,[number,number]>={'9:16':[720,1280],'1:1':[900,900],'16:9':[1280,720]};
const uid=()=>Math.random().toString(36).slice(2,9);
const clen=(c:Clip)=>Math.max(0.1,(c.outT-c.inT)/c.speed);
const fmt=(s:number)=>Math.floor(s/60)+':'+(s%60).toFixed(1).padStart(4,'0');
const box:React.CSSProperties={marginBottom:14};
const readSaved=():any=>{try{return JSON.parse(localStorage.getItem('yn_avatar')||'{}')}catch{return {}}};
function wrap(x:CanvasRenderingContext2D,text:string,maxW:number){const out:string[]=[];let l='';for(const w of text.split(/\s+/)){const n=l?l+' '+w:w;if(x.measureText(n).width>maxW&&l){out.push(l);l=w}else l=n}if(l)out.push(l);return out}
/* green screen: draw the frame small, turn pixels close to the key colour transparent (with a soft edge and green spill removal) */
let KC:HTMLCanvasElement|null=null;
function keyFrame(v:HTMLVideoElement,w:number,h:number,k:{color:string;tol:number}){
  const kw=Math.min(w,640),kh=Math.round(h*kw/w);if(!KC)KC=document.createElement('canvas');if(KC.width!==kw||KC.height!==kh){KC.width=kw;KC.height=kh}
  const x=KC.getContext('2d',{willReadFrequently:true} as any)!;x.clearRect(0,0,kw,kh);const sc=Math.max(kw/v.videoWidth,kh/v.videoHeight);x.drawImage(v,(kw-v.videoWidth*sc)/2,(kh-v.videoHeight*sc)/2,v.videoWidth*sc,v.videoHeight*sc);
  const im=x.getImageData(0,0,kw,kh),d=im.data,kr=parseInt(k.color.slice(1,3),16),kg=parseInt(k.color.slice(3,5),16),kb=parseInt(k.color.slice(5,7),16),t0=k.tol*300,t1=t0+60,green=kg>kr&&kg>kb;
  for(let i=0;i<d.length;i+=4){const dr=d[i]-kr,dg=d[i+1]-kg,db=d[i+2]-kb,dist=Math.sqrt(dr*dr+dg*dg+db*db),m=Math.max(d[i],d[i+2]);
    if(dist<t0)d[i+3]=0;else{if(dist<t1)d[i+3]=((dist-t0)/60)*255;if(green&&d[i+1]>m)d[i+1]=m+(d[i+1]-m)*0.4}}
  x.putImageData(im,0,0);return KC}
/* transition INTO a clip, applied while it plays its first moments (fade also fades the previous clip out) */
function trans(x:CanvasRenderingContext2D,seg:any,nx:any,tl:number,w:number,h:number){
  const c=seg.clip,lt=tl-seg.start,td=Math.min(c.td||0.5,seg.len/2);let a=1;
  if(c.trans&&c.trans!=='none'&&td>0&&lt<td){const p=Math.max(0,lt/td),e=1-Math.pow(1-p,3);
    if(c.trans==='fade')a=Math.min(1,lt/(td/2));
    if(c.trans==='slide')x.translate((1-e)*w,0);
    if(c.trans==='zoom'){x.translate(w/2,h/2);const z=1+(1-e)*0.4;x.scale(z,z);x.translate(-w/2,-h/2);a=e}
    if(c.trans==='wipe'){x.beginPath();x.rect(0,0,w*e,h);x.clip()}}
  if(nx&&nx.clip.trans==='fade'){const ntd=Math.min(nx.clip.td||0.5,nx.len/2);a=Math.min(a,Math.max(0,(seg.len-lt)/(ntd/2)))}
  x.globalAlpha=Math.max(0,Math.min(1,a))}

export default function AdminVideoEditor(){
  const[clips,setClips]=useState<Clip[]>([]),[ovs,setOvs]=useState<Ov[]>([]),[aspect,setAspect]=useState('9:16'),[sel,setSel]=useState(''),[t,setT]=useState(0),[playing,setPlaying]=useState(false),[exporting,setExporting]=useState(false),[music,setMusic]=useState<{url:string,name:string,vol:number}|null>(null),[outUrl,setOutUrl]=useState(''),[outExt,setOutExt]=useState('mp4'),[err,setErr]=useState('');
  const[caps,setCaps]=useState<Cap[]>([]),[capStyle,setCapStyle]=useState({size:6,y:0.68,color:'#ffffff',box:true}),[asr,setAsr]=useState({busy:false,msg:'',lang:'auto',model:'Xenova/whisper-tiny'}),[av,setAv]=useState<AvCfg>(()=>({...DEF,...(readSaved().cfg||{})})),[avAuto,setAvAuto]=useState(()=>({on:true,corner:'br',size:30,...(readSaved().auto||{})})),[bgColor,setBgColor]=useState('#1a1a2e'),[bgTick,setBgTick]=useState(0),[pick,setPick]=useState(false);
  const vRef=useRef<HTMLVideoElement>(null),cRef=useRef<HTMLCanvasElement>(null),aRef=useRef<HTMLAudioElement>(null),avRef=useRef<HTMLImageElement|null>(null);
  const acRef=useRef<any>(null),idxRef=useRef(0),playRef=useRef(false),rafRef=useRef(0),endRef=useRef<null|(()=>void)>(null),lvlRef=useRef(0),anRef=useRef<AnalyserNode|null>(null),bgImg=useRef<HTMLImageElement|null>(null);
  const segs=useMemo(()=>{let s=0;return clips.map(c=>{const o={clip:c,start:s,len:clen(c)};s+=o.len;return o})},[clips]);
  const total=segs.length?segs[segs.length-1].start+segs[segs.length-1].len:0;
  const S=useRef<any>({});S.current={ovs,aspect,segs,total,music,caps,capStyle,av,avAuto,bgColor,pick};
  useEffect(()=>{try{localStorage.setItem('yn_avatar',JSON.stringify({cfg:av,auto:avAuto}))}catch{}},[av,avAuto]);
  const[W,H]=ASPECTS[aspect];
  useEffect(()=>{const im=new Image();im.src='/avatar-doodle.svg';avRef.current=im;return()=>{playRef.current=false;cancelAnimationFrame(rafRef.current)}},[]);

  function draw(tl:number){
    const c=cRef.current,v=vRef.current;if(!c||!v)return;const[w,h]=ASPECTS[S.current.aspect];if(c.width!==w||c.height!==h){c.width=w;c.height=h}
    const x=c.getContext('2d')!,Z=S.current;x.globalAlpha=1;x.fillStyle='#000';x.fillRect(0,0,w,h);
    const i=idxRef.current,seg=Z.segs[i],nx=Z.segs[i+1];
    if(seg&&v.videoWidth){
      const k=seg.clip.key,keyOn=k?.on&&!Z.pick,sc=Math.max(w/v.videoWidth,h/v.videoHeight);
      x.save();trans(x,seg,nx,tl,w,h);
      if(keyOn){const im=bgImg.current;if(im&&im.complete&&im.width){const s2=Math.max(w/im.width,h/im.height);x.drawImage(im,(w-im.width*s2)/2,(h-im.height*s2)/2,im.width*s2,im.height*s2)}else{x.fillStyle=Z.bgColor;x.fillRect(0,0,w,h)}}
      (x as any).filter=FILTERS[seg.clip.filter]||'none';
      if(keyOn)x.drawImage(keyFrame(v,w,h,k),0,0,w,h);else x.drawImage(v,(w-v.videoWidth*sc)/2,(h-v.videoHeight*sc)/2,v.videoWidth*sc,v.videoHeight*sc);
      (x as any).filter='none';x.restore()}
    x.globalAlpha=1;
    const speaking=(Z.caps as Cap[]).some(q=>tl>=q.start&&tl<=q.end),talk=Math.min(1,Math.max(lvlRef.current,speaking&&lvlRef.current<0.05?0.35+0.35*Math.abs(Math.sin(tl*13)):0));
    const gest=(a:AvCfg,l:number)=>a.autoGestures?(l<Math.min(2.5,Z.total/2)?'wave':l>Z.total-Math.min(2,Z.total/2)?'thumbs':'none'):a.gesture;
    if(Z.avAuto.on){const s2=Z.avAuto.size*w/100,m=w*0.03,cx=Z.avAuto.corner.includes('l')?m+s2/2:Z.avAuto.corner.includes('r')?w-m-s2/2:w/2,cy=Z.avAuto.corner.includes('t')?m+s2/2:h-m-s2/2;drawAvatar(x,Z.av,cx,cy,s2,tl,{talk,gesture:gest(Z.av,tl) as any})}
    for(const o of Z.ovs as Ov[]){if(tl<o.start||tl>o.end)continue;
      if(o.kind==='avatar'){drawAvatar(x,Z.av,o.x*w,o.y*h,o.size*w/100,tl,{talk,gesture:gest(Z.av,tl) as any})}
      else{x.font='700 '+(o.size*w/100)+'px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.lineWidth=Math.max(4,o.size*w/600);x.lineJoin='round';x.strokeStyle='#000';x.strokeText(o.text,o.x*w,o.y*h);x.fillStyle=o.color;x.fillText(o.text,o.x*w,o.y*h)}}
    const cp=Z.capStyle;for(const q of Z.caps as Cap[]){if(tl<q.start||tl>q.end)continue;
      const fs=cp.size*w/100;x.font='700 '+fs+'px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';
      const ls=wrap(x,q.text,w*0.86),lh=fs*1.25,bh=ls.length*lh+fs*0.5,cy=cp.y*h;
      if(cp.box){x.fillStyle='rgba(0,0,0,.62)';const bw=Math.min(w*0.94,Math.max(...ls.map(l=>x.measureText(l).width))+fs);x.beginPath();if((x as any).roundRect)(x as any).roundRect((w-bw)/2,cy-bh/2,bw,bh,fs*0.3);else x.rect((w-bw)/2,cy-bh/2,bw,bh);x.fill()}
      x.lineJoin='round';x.lineWidth=Math.max(3,fs/9);x.strokeStyle='#000';
      ls.forEach((l,j)=>{const yy=cy-bh/2+fs*0.25+lh*(j+0.5);if(!cp.box)x.strokeText(l,w/2,yy);x.fillStyle=cp.color;x.fillText(l,w/2,yy)})}
  }
  function level(){const an=anRef.current;if(!an)return 0;const d=new Uint8Array(an.fftSize);an.getByteTimeDomainData(d);let q=0;for(const b of d){const n=(b-128)/128;q+=n*n}return Math.min(1,Math.sqrt(q/d.length)*5)}
  function audio(){
    if(acRef.current)return acRef.current;const ctx=new (window.AudioContext||(window as any).webkitAudioContext)();const dest=ctx.createMediaStreamDestination(),spk=ctx.createGain(),vG=ctx.createGain(),mG=ctx.createGain();spk.connect(ctx.destination);
    ctx.createMediaElementSource(vRef.current!).connect(vG);ctx.createMediaElementSource(aRef.current!).connect(mG);for(const g of [vG,mG]){g.connect(dest);g.connect(spk)}
    mG.gain.value=S.current.music?.vol??0.5;const an=ctx.createAnalyser();an.fftSize=512;vG.connect(an);anRef.current=an;return acRef.current={ctx,dest,spk,vG,mG};
  }
  useEffect(()=>{if(acRef.current)acRef.current.mG.gain.value=music?.vol??0.5},[music?.vol]);
  async function loadSeg(i:number,tl:number,play:boolean){
    const v=vRef.current,seg=S.current.segs[i];if(!v||!seg)return;idxRef.current=i;
    if(v.dataset.u!==seg.clip.url){v.dataset.u=seg.clip.url;v.src=seg.clip.url;await new Promise<void>(r=>{v.onloadedmetadata=()=>r();setTimeout(r,2500)})}
    v.playbackRate=seg.clip.speed;if(acRef.current)acRef.current.vG.gain.value=seg.clip.vol;
    const target=Math.min(seg.clip.inT+(tl-seg.start)*seg.clip.speed,Math.max(0,(v.duration||1e9)-0.02));
    if(Math.abs(v.currentTime-target)>0.02)await new Promise<void>(r=>{v.onseeked=()=>r();setTimeout(r,600);v.currentTime=target});
    if(play)await v.play().catch(()=>{});draw(tl);
  }
  const segAt=(tl:number)=>{const i=S.current.segs.findIndex((s:any)=>tl<s.start+s.len);return i<0?Math.max(0,S.current.segs.length-1):i};
  function stop(end?:boolean){lvlRef.current=0;playRef.current=false;cancelAnimationFrame(rafRef.current);vRef.current?.pause();aRef.current?.pause();setPlaying(false);if(end){setT(S.current.total);const f=endRef.current;endRef.current=null;f?.()}}
  function loop(){
    const v=vRef.current,seg=S.current.segs[idxRef.current];if(!v||!seg||!playRef.current)return;
    const tl=seg.start+(v.currentTime-seg.clip.inT)/seg.clip.speed;
    if(v.currentTime>=seg.clip.outT-0.04||v.ended){const n=idxRef.current+1;if(n>=S.current.segs.length){stop(true);return}loadSeg(n,S.current.segs[n].start,true).then(()=>{if(playRef.current)rafRef.current=requestAnimationFrame(loop)});return}
    lvlRef.current=level();draw(tl);setT(tl);rafRef.current=requestAnimationFrame(loop);
  }
  async function startPlayback(tl:number){
    if(!S.current.segs.length)return;const a=audio();await a.ctx.resume();playRef.current=true;setPlaying(true);await loadSeg(segAt(tl),tl,true);
    const au=aRef.current!;if(S.current.music){au.currentTime=au.duration?tl%au.duration:0;au.play().catch(()=>{})}rafRef.current=requestAnimationFrame(loop);
  }
  async function seekTo(tl:number){if(!S.current.segs.length)return;await loadSeg(segAt(tl),tl,false)}
  useEffect(()=>{if(!playRef.current&&segs.length)seekTo(Math.min(t,total))},[segs]);
  useEffect(()=>{if(!playRef.current)draw(t)},[aspect,ovs,t,pick,caps,capStyle,av,avAuto,bgColor,bgTick,clips]);

  async function addFiles(files:FileList|null){
    if(!files)return;setErr('');const add:Clip[]=[];
    for(const f of Array.from(files)){const url=URL.createObjectURL(f);const dur=await new Promise<number>(r=>{const v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>r(v.duration||0);v.onerror=()=>r(0);v.src=url});
      if(!dur||!isFinite(dur)){setErr('Could not read "'+f.name+'". Try an MP4 or WebM file.');continue}add.push({id:uid(),name:f.name,url,dur,inT:0,outT:dur,speed:1,vol:1,filter:'None',trans:'none',td:0.5,key:{on:false,color:'#00ff00',tol:0.35}})}
    if(add.length){setClips(c=>[...c,...add]);setSel(s=>s||add[0].id)}
  }
  const patch=(id:string,p:Partial<Clip>)=>setClips(cs=>cs.map(c=>c.id===id?{...c,...p}:c));
  const cur=clips.find(c=>c.id===sel);
  function split(){const sg=segs.find(s=>t>s.start+0.1&&t<s.start+s.len-0.1);if(!sg)return;const c=sg.clip,at=c.inT+(t-sg.start)*c.speed;setClips(cs=>cs.flatMap(x=>x.id===c.id?[{...c,outT:at},{...c,id:uid(),inT:at,trans:'none'}]:[x]))}
  function move(id:string,d:number){setClips(cs=>{const i=cs.findIndex(c=>c.id===id),j=i+d;if(i<0||j<0||j>=cs.length)return cs;const n=[...cs];[n[i],n[j]]=[n[j],n[i]];return n})}
  function remove(id:string){setClips(cs=>cs.filter(c=>c.id!==id));if(sel===id)setSel('')}
  const addOv=(p:Partial<Ov>)=>setOvs(o=>[...o,{id:uid(),kind:'text',text:'Your text',start:t,end:Math.max(t+0.5,Math.min(total||t+3,t+3)),x:0.5,y:0.8,size:8,color:'#ffffff',...p}]);
  const pov=(id:string,p:Partial<Ov>)=>setOvs(o=>o.map(x=>x.id===id?{...x,...p}:x));

  function onCanvasClick(e:React.MouseEvent<HTMLCanvasElement>){
    if(!pick||!cur)return;const c=cRef.current!,r=c.getBoundingClientRect(),px=Math.floor((e.clientX-r.left)*c.width/r.width),py=Math.floor((e.clientY-r.top)*c.height/r.height);
    const d=c.getContext('2d')!.getImageData(px,py,1,1).data;patch(cur.id,{key:{...cur.key,color:'#'+[d[0],d[1],d[2]].map(n=>n.toString(16).padStart(2,'0')).join(''),on:true}});setPick(false)}
  async function pcm16k(url:string){const buf=await (await fetch(url)).arrayBuffer(),ac=new (window.AudioContext||(window as any).webkitAudioContext)(),dec=await ac.decodeAudioData(buf);ac.close();
    const oc=new OfflineAudioContext(1,Math.ceil(dec.duration*16000),16000),src=oc.createBufferSource();src.buffer=dec;src.connect(oc.destination);src.start();return (await oc.startRendering()).getChannelData(0)}
  async function transcribe(){
    if(!segs.length||asr.busy)return;setAsr(a=>({...a,busy:true,msg:'Loading the speech model…'}));
    try{
      const lib='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm',tf:any=await import(/* @vite-ignore */ lib);
      const pipe=await tf.pipeline('automatic-speech-recognition',asr.model,{progress_callback:(p:any)=>{if(p?.status==='progress')setAsr(a=>({...a,msg:'Downloading the speech model… '+Math.round(p.progress||0)+'%'}))}});
      const out:Cap[]=[],cache:Record<string,any[]>={};
      for(const sg of segs){const c=sg.clip;
        if(!cache[c.url]){setAsr(a=>({...a,msg:'Listening to "'+c.name+'"…'}));const pcm=await pcm16k(c.url),opt:any={return_timestamps:true,chunk_length_s:30,stride_length_s:5,task:'transcribe'};if(asr.lang!=='auto')opt.language=asr.lang;const r=await pipe(pcm,opt);cache[c.url]=r.chunks||[{text:r.text,timestamp:[0,c.dur]}]}
        for(const ch of cache[c.url]){const a0=ch.timestamp?.[0]??0,b0=ch.timestamp?.[1]??c.dur;if(b0<=c.inT||a0>=c.outT)continue;const text=String(ch.text||'').trim();if(!text)continue;
          out.push({id:uid(),text,start:sg.start+(Math.max(a0,c.inT)-c.inT)/c.speed,end:sg.start+(Math.min(b0,c.outT)-c.inT)/c.speed})}}
      setCaps(out);setAsr(a=>({...a,busy:false,msg:out.length?'Done: '+out.length+' captions. Check and edit the lines below.':'No speech found in these clips.'}));
    }catch(e:any){setAsr(a=>({...a,busy:false,msg:'Could not make captions ('+(e?.message||e)+'). This needs internet the first time, and clips with sound.'}))}
  }
  const setA=(p:Partial<AvCfg>)=>setAv(a=>({...a,...p}));
  const colF=(label:string,k:keyof AvCfg)=><label style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>{label}<input type="color" value={av[k] as string} onChange={e=>setA({[k]:e.target.value} as any)} style={{width:48,padding:2}}/></label>;
  const selF=(label:string,k:keyof AvCfg,opts:string[])=><label>{label}<select value={av[k] as string} onChange={e=>setA({[k]:e.target.value} as any)}>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></label>;
  const togF=(label:string,k:keyof AvCfg)=><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!av[k]} onChange={e=>setA({[k]:e.target.checked} as any)} style={{width:'auto'}}/>{label}</label>;
  function savePng(){const c=document.createElement('canvas');c.width=c.height=800;drawAvatar(c.getContext('2d')!,av,400,400,800,1,{});const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='my-avatar.png';a.click()}
  async function doExport(){
    if(!segs.length||exporting)return;setErr('');setOutUrl('');setExporting(true);stop();const a=audio();await a.ctx.resume();a.spk.gain.value=0;
    try{
      const types=['video/mp4;codecs=avc1,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm'],mime=types.find(m=>(window as any).MediaRecorder?.isTypeSupported(m))||'';
      const stream=(cRef.current as any).captureStream(30) as MediaStream;a.dest.stream.getAudioTracks().forEach((k:any)=>stream.addTrack(k));
      const rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:6000000}:undefined),parts:Blob[]=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
      const stopped=new Promise<void>(r=>{rec.onstop=()=>r()});rec.start(250);
      await new Promise<void>(res=>{endRef.current=res;setT(0);startPlayback(0)});
      rec.stop();await stopped;const type=(mime.split(';')[0])||'video/webm';setOutExt(type.includes('mp4')?'mp4':'webm');setOutUrl(URL.createObjectURL(new Blob(parts,{type})));
    }catch(e:any){setErr(e?.message||'Export failed in this browser.')}
    a.spk.gain.value=1;setExporting(false);
  }

  const rng=(v:number,min:number,max:number,step:number,on:(n:number)=>void)=><input type="range" min={min} max={max} step={step} value={v} onChange={e=>on(Number(e.target.value))} style={{width:'100%'}}/>;
  return <div>
    <section className="panel" style={{...box,display:'flex',gap:14,alignItems:'center'}}>
      <AvatarPreview cfg={av} size={72}/>
      <div><span className="eyebrow">VIDEO STUDIO</span><h2 style={{margin:'2px 0'}}>Edit videos like CapCut</h2><p style={{margin:0,opacity:.75}}>Add clips, cut them, add text and stickers, then export. Everything stays on your device.</p></div>
    </section>
    {err&&<p className="notice">{err}</p>}
    <section className="panel" style={box}>
      <canvas ref={cRef} width={W} height={H} onClick={onCanvasClick} style={{display:'block',margin:'0 auto',maxWidth:'100%',maxHeight:'56vh',background:'#000',borderRadius:12,cursor:pick?'crosshair':'default'}}/>
      <video ref={vRef} playsInline preload="auto" style={{display:'none'}}/><audio ref={aRef} src={music?.url} loop style={{display:'none'}}/>
      <div style={{display:'flex',gap:10,alignItems:'center',marginTop:12}}>
        <button className="secondary" disabled={!segs.length||exporting} onClick={()=>playing?stop():startPlayback(t>=total-0.05?0:t)}>{playing?<Pause/>:<Play/>}</button>
        <input type="range" min={0} max={total||1} step={0.05} value={Math.min(t,total||1)} disabled={!segs.length||exporting} onChange={e=>{const n=Number(e.target.value);if(playRef.current)stop();setT(n);seekTo(n)}} style={{flex:1}}/>
        <small>{fmt(t)} / {fmt(total)}</small>
      </div>
      <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
        {Object.keys(ASPECTS).map(a=><button key={a} className={a===aspect?'':'secondary'} onClick={()=>setAspect(a)}>{a}</button>)}
      </div>
    </section>
    <section className="panel" style={box}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
        <label className="secondary button" style={{cursor:'pointer'}}><Plus/> Add clips<input type="file" accept="video/*" multiple hidden onChange={e=>{addFiles(e.target.files);e.target.value=''}}/></label>
        <button className="secondary" disabled={!segs.length} onClick={split}><Scissors/> Split here</button>
        <button className="secondary" disabled={!cur} onClick={()=>cur&&remove(cur.id)}><Trash2/> Delete</button>
      </div>
      {!segs.length?<p style={{opacity:.7}}>No clips yet. Tap “Add clips” to start.</p>
      :<div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:6}}>{segs.map(s=><div key={s.clip.id} onClick={()=>{setSel(s.clip.id);if(playRef.current)stop();setT(s.start);seekTo(s.start)}} style={{flex:'0 0 '+Math.max(70,s.len/Math.max(total,1)*100*4)+'px',padding:8,borderRadius:10,cursor:'pointer',border:'2px solid '+(s.clip.id===sel?'#7c3aed':'transparent'),background:'rgba(124,58,237,.18)'}}>
        <small style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.clip.name}</small><b>{s.len.toFixed(1)}s</b>
        <div style={{display:'flex',gap:4,marginTop:4}}><button className="icon" onClick={e=>{e.stopPropagation();move(s.clip.id,-1)}}><ChevronLeft size={14}/></button><button className="icon" onClick={e=>{e.stopPropagation();move(s.clip.id,1)}}><ChevronRight size={14}/></button></div></div>)}</div>}
    </section>
    {cur&&<section className="panel" style={box}>
      <span className="eyebrow">SELECTED CLIP</span>
      <label>Start {cur.inT.toFixed(1)}s{rng(cur.inT,0,Math.max(0,cur.outT-0.2),0.1,n=>patch(cur.id,{inT:n}))}</label>
      <label>End {cur.outT.toFixed(1)}s{rng(cur.outT,Math.min(cur.dur,cur.inT+0.2),cur.dur,0.1,n=>patch(cur.id,{outT:n}))}</label>
      <label>Speed <select value={cur.speed} onChange={e=>patch(cur.id,{speed:Number(e.target.value)})}>{[0.5,0.75,1,1.5,2].map(n=><option key={n} value={n}>{n}x</option>)}</select></label>
      <label>Volume {Math.round(cur.vol*100)}%{rng(cur.vol,0,1,0.05,n=>patch(cur.id,{vol:n}))}</label>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>{Object.keys(FILTERS).map(f=><button key={f} className={cur.filter===f?'':'secondary'} onClick={()=>patch(cur.id,{filter:f})}>{f}</button>)}</div>
      <small style={{opacity:.65}}>Filters need Chrome, Edge or Android; iPhone Safari skips them.</small>
      <label style={{marginTop:10}}>Transition into this clip <select value={cur.trans} onChange={e=>patch(cur.id,{trans:e.target.value})}>{[['none','None'],['fade','Fade through black'],['slide','Slide in'],['zoom','Zoom in'],['wipe','Wipe']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {cur.trans!=='none'&&<label>Transition length {cur.td.toFixed(1)}s{rng(cur.td,0.2,1.5,0.1,n=>patch(cur.id,{td:n}))}</label>}
      <div style={{borderTop:'1px solid rgba(128,128,160,.3)',marginTop:12,paddingTop:10}}>
        <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} checked={cur.key.on} onChange={e=>patch(cur.id,{key:{...cur.key,on:e.target.checked}})}/>Green screen (remove the background colour)</label>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',margin:'8px 0'}}>
          <button className={pick?'':'secondary'} onClick={()=>setPick(p=>!p)}>{pick?'Now tap the background in the preview':'Pick colour from preview'}</button>
          <input type="color" value={cur.key.color} onChange={e=>patch(cur.id,{key:{...cur.key,color:e.target.value}})} aria-label="Key colour" style={{width:48,padding:2}}/>
        </div>
        <label>Strength {Math.round(cur.key.tol*100)}%{rng(cur.key.tol,0.05,0.9,0.01,n=>patch(cur.id,{key:{...cur.key,tol:n}}))}</label>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <label style={{display:'flex',gap:8,alignItems:'center'}}>New background <input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)} style={{width:48,padding:2}}/></label>
          <label className="secondary button" style={{cursor:'pointer'}}>Background picture<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f){const im=new Image();im.onload=()=>{bgImg.current=im;setBgTick(n=>n+1)};im.src=URL.createObjectURL(f)}e.target.value=''}}/></label>
          <button className="secondary" onClick={()=>{bgImg.current=null;setBgTick(n=>n+1)}}>Clear picture</button>
        </div>
      </div>
    </section>}
    <section className="panel" style={box}>
      <span className="eyebrow">TEXT, STICKERS & MUSIC</span>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0'}}>
        <button className="secondary" onClick={()=>addOv({})}><Type/> Text</button>
        <button className="secondary" onClick={()=>addOv({kind:'avatar',x:0.8,y:0.75,size:28})}>My avatar</button>
        {['🔥','⭐','❤️','😂','👍'].map(e=><button key={e} className="secondary" onClick={()=>addOv({text:e,size:16,y:0.5})}>{e}</button>)}
        <label className="secondary button" style={{cursor:'pointer'}}><Music/> {music?'Change music':'Add music'}<input type="file" accept="audio/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)setMusic({url:URL.createObjectURL(f),name:f.name,vol:music?.vol??0.5});e.target.value=''}}/></label>
      </div>
      {music&&<label>Music: {music.name} · {Math.round(music.vol*100)}%{rng(music.vol,0,1,0.05,n=>setMusic({...music,vol:n}))}<button className="secondary" onClick={()=>setMusic(null)}>Remove music</button></label>}
      {ovs.map(o=><div key={o.id} style={{borderTop:'1px solid rgba(128,128,160,.3)',paddingTop:10,marginTop:10}}>
        {o.kind==='text'?<input value={o.text} onChange={e=>pov(o.id,{text:e.target.value})} aria-label="Text"/>:<b>Avatar sticker</b>}
        <label>Shows from {o.start.toFixed(1)}s to {o.end.toFixed(1)}s{rng(o.start,0,Math.max(total,1),0.1,n=>pov(o.id,{start:n,end:Math.max(o.end,n+0.2)}))}{rng(o.end,0,Math.max(total,1),0.1,n=>pov(o.id,{end:Math.max(n,o.start+0.2)}))}</label>
        <label>Size{rng(o.size,3,60,1,n=>pov(o.id,{size:n}))}</label><label>Left to right{rng(o.x,0,1,0.01,n=>pov(o.id,{x:n}))}</label><label>Top to bottom{rng(o.y,0,1,0.01,n=>pov(o.id,{y:n}))}</label>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>{o.kind==='text'&&<input type="color" value={o.color} onChange={e=>pov(o.id,{color:e.target.value})} aria-label="Colour" style={{width:48,padding:2}}/>}<button className="secondary" onClick={()=>setOvs(x=>x.filter(y=>y.id!==o.id))}><Trash2/> Remove</button></div>
      </div>)}
    </section>
    <section className="panel" style={box}>
      <span className="eyebrow">AUTO CAPTIONS</span>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0'}}>
        <select value={asr.lang} onChange={e=>setAsr(a=>({...a,lang:e.target.value}))}>{[['auto','Auto-detect language'],['english','English'],['khmer','Khmer (ភាសាខ្មែរ)'],['chinese','Chinese'],['thai','Thai'],['vietnamese','Vietnamese']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select value={asr.model} onChange={e=>setAsr(a=>({...a,model:e.target.value}))}><option value="Xenova/whisper-tiny">Fast (about 40 MB)</option><option value="Xenova/whisper-base">Better (about 80 MB)</option></select>
        <button disabled={!segs.length||asr.busy||exporting} onClick={transcribe}>{asr.busy?'Working…':'Make captions'}</button>
        <button className="secondary" onClick={()=>setCaps(c=>[...c,{id:uid(),text:'Caption',start:t,end:Math.min(Math.max(total,t+2),t+2)}])}>Add line</button>
        {caps.length>0&&<button className="secondary" onClick={()=>setCaps([])}>Clear all</button>}
      </div>
      {asr.msg&&<p className="notice">{asr.msg}</p>}
      <small style={{opacity:.65}}>The first time downloads a speech model (then it is saved in the browser). Khmer is less accurate, so check every line.</small>
      <label>Size {capStyle.size}{rng(capStyle.size,3,12,0.5,n=>setCapStyle({...capStyle,size:n}))}</label><label>Height{rng(capStyle.y,0.1,0.95,0.01,n=>setCapStyle({...capStyle,y:n}))}</label>
      <div style={{display:'flex',gap:12,alignItems:'center'}}><input type="color" value={capStyle.color} onChange={e=>setCapStyle({...capStyle,color:e.target.value})} aria-label="Caption colour" style={{width:48,padding:2}}/><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} checked={capStyle.box} onChange={e=>setCapStyle({...capStyle,box:e.target.checked})}/>Dark box</label></div>
      <div style={{maxHeight:260,overflowY:'auto',marginTop:8}}>{caps.map(q=><div key={q.id} style={{display:'flex',gap:6,marginBottom:6}}>
        <input value={q.text} onChange={e=>setCaps(c=>c.map(z=>z.id===q.id?{...z,text:e.target.value}:z))} aria-label="Caption text" style={{flex:1}}/>
        <input type="number" step={0.1} value={Number(q.start.toFixed(1))} onChange={e=>setCaps(c=>c.map(z=>z.id===q.id?{...z,start:Number(e.target.value)}:z))} aria-label="Start" style={{width:68}}/>
        <input type="number" step={0.1} value={Number(q.end.toFixed(1))} onChange={e=>setCaps(c=>c.map(z=>z.id===q.id?{...z,end:Number(e.target.value)}:z))} aria-label="End" style={{width:68}}/>
        <button className="secondary" onClick={()=>setCaps(c=>c.filter(z=>z.id!==q.id))} aria-label="Delete line"><Trash2 size={16}/></button></div>)}</div>
    </section>
    <section className="panel" style={box}>
      <span className="eyebrow">MY AVATAR</span>
      <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-start',margin:'8px 0'}}>
        <div style={{textAlign:'center'}}><AvatarPreview cfg={av} size={170}/><div style={{display:'flex',gap:6,marginTop:8}}><button className="secondary" onClick={savePng}>Save PNG</button><button className="secondary" onClick={()=>setAv(DEF)}>Reset</button></div></div>
        <div style={{flex:'1 1 220px'}}>
          <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" style={{width:'auto'}} checked={avAuto.on} onChange={e=>setAvAuto({...avAuto,on:e.target.checked})}/>Put my avatar on the whole video</label>
          <label>Where<select value={avAuto.corner} onChange={e=>setAvAuto({...avAuto,corner:e.target.value})}>{[['br','Bottom right'],['bl','Bottom left'],['bc','Bottom middle'],['tr','Top right'],['tl','Top left']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>Avatar size {avAuto.size}%{rng(avAuto.size,10,70,1,n=>setAvAuto({...avAuto,size:n}))}</label>
          {togF('Auto gestures: wave at the start, thumbs-up at the end','autoGestures')}
          <small style={{opacity:.65}}>The mouth moves with the voice, and the avatar blinks and bounces by itself.</small>
        </div>
      </div>
      <b>Hands</b>
      {selF('Gesture (used when auto gestures is off)','gesture',GESTURES)}{selF('Which hand','hand',['right','left','both'])}{selF('Hand movement','motion',['wave','still','bounce','circle'])}
      <label>Movement speed {av.speed.toFixed(1)}x{rng(av.speed,0.3,2.5,0.1,n=>setA({speed:n}))}</label>{togF('Gentle body bounce','bounce')}
      <b style={{display:'block',marginTop:10}}>Face & hair</b>
      {selF('Expression','expr',['smile','happy','surprised','cool'])}{selF('Hair style','hairStyle',['slick','short','spiky','long','bald'])}{colF('Hair colour','hair')}{colF('Skin tone','skin')}{colF('Eye colour','eye')}
      {selF('Glasses','glasses',['none','round','square'])}{av.glasses!=='none'&&colF('Glasses colour','glassColor')}{togF('Blush','blush')}{togF('Moles','moles')}
      <b style={{display:'block',marginTop:10}}>Clothes & background</b>
      {colF('Blazer','blazer')}{colF('Shirt','shirt')}{togF('Tie','tie')}{av.tie&&colF('Tie colour','tieColor')}{togF('Coloured square behind avatar','bgOn')}{av.bgOn&&colF('Square colour','bg')}
    </section>
    <section className="panel" style={box}>
      <button className="wide" disabled={!segs.length||exporting} onClick={doExport}><Download/> {exporting?'Exporting… keep this page open ('+fmt(t)+' / '+fmt(total)+')':'Export video'}</button>
      {outUrl&&<p><a className="secondary button" href={outUrl} download={'yn-studio-video.'+outExt}><Download/> Download your video (.{outExt})</a></p>}
      <small style={{opacity:.65}}>Export records the preview in real time, so a 30-second video takes about 30 seconds. Keep the screen on.</small>
    </section>
  </div>;
}
