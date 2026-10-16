import React,{useEffect,useRef} from 'react';

/* Parametric doodle avatar drawn straight onto a canvas, so it can animate (blink, bounce, talk, wave) in the editor, the live preview and the exported video. */
export type Gesture='none'|'wave'|'thumbs'|'peace'|'point'|'ok';
export const GESTURES:Gesture[]=['none','wave','thumbs','peace','point','ok'];
export type AvCfg={skin:string;hair:string;hairStyle:string;eye:string;glasses:string;glassColor:string;expr:string;blush:boolean;moles:boolean;blazer:string;shirt:string;tie:boolean;tieColor:string;bgOn:boolean;bg:string;gesture:Gesture;hand:string;motion:string;speed:number;bounce:boolean;autoGestures:boolean};
export const DEF:AvCfg={skin:'#f4cfae',hair:'#17171d',hairStyle:'slick',eye:'#2a1a14',glasses:'none',glassColor:'#222222',expr:'smile',blush:true,moles:true,blazer:'#1d1d27',shirt:'#9cc2f5',tie:true,tieColor:'#2b4fb8',bgOn:false,bg:'#2f8cff',gesture:'wave',hand:'right',motion:'wave',speed:1,bounce:true,autoGestures:true};

const K='#111';
type X=CanvasRenderingContext2D;
const path=(x:X,d:string,fill?:string,lw=4.5,col=K)=>{const p=new Path2D(d);if(fill){x.fillStyle=fill;x.fill(p)}if(lw){x.lineWidth=lw;x.strokeStyle=col;x.stroke(p)}};
const rod=(x:X,x1:number,y1:number,x2:number,y2:number,w:number,c:string)=>{x.lineCap='round';x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.strokeStyle=K;x.lineWidth=w+6;x.stroke();x.strokeStyle=c;x.lineWidth=w;x.stroke()};
const FIST='M-15 -6 Q-15 -14 -7 -14 H11 Q16 -14 16 -6 V12 Q16 22 6 22 H-6 Q-15 22 -15 12 Z';
function hand(x:X,g:Gesture,s:string){
  if(g==='wave'){[[-10,26],[-3.3,31],[3.3,29],[10,22]].forEach(([fx,l])=>rod(x,fx,-6,fx,-6-l,8,s));rod(x,-12,6,-27,-6,8,s);path(x,'M-15 -4 Q-15 -12 -7 -12 H9 Q15 -12 15 -4 V10 Q15 22 0 22 Q-15 22 -15 10 Z',s)}
  else if(g==='thumbs'){rod(x,-4,-10,-4,-36,9,s);path(x,FIST,s);path(x,'M-15 0 H16 M-15 8 H16',undefined,3)}
  else if(g==='peace'){rod(x,-4,-12,-9,-38,7,s);rod(x,6,-12,11,-38,7,s);path(x,FIST,s);path(x,'M-15 6 H16',undefined,3)}
  else if(g==='point'){rod(x,0,-12,0,-42,7,s);path(x,FIST,s);path(x,'M-15 6 H16',undefined,3)}
  else if(g==='ok'){rod(x,2,-10,0,-34,7,s);rod(x,9,-10,10,-34,7,s);rod(x,15,-6,18,-28,7,s);path(x,FIST,s);x.beginPath();x.arc(-9,-14,9,0,7);x.strokeStyle=K;x.lineWidth=13;x.stroke();x.strokeStyle=s;x.lineWidth=7;x.stroke()}
}
const HAIR:Record<string,string>={
  slick:'M106 168 C94 94 140 50 202 48 C266 50 306 94 294 168 C288 128 264 110 238 105 C216 101 184 101 162 105 C136 110 112 128 106 168 Z',
  short:'M110 156 C106 98 148 66 200 64 C252 66 294 98 290 156 C282 122 252 104 200 102 C148 104 118 122 110 156Z',
  spiky:'M108 160 L112 104 L134 120 L146 70 L170 100 L192 52 L214 100 L240 66 L252 106 L276 84 L290 160 C284 130 262 112 238 106 C216 102 184 102 162 106 C136 112 114 130 108 160Z',
  long:'M110 160 C104 96 146 62 200 60 C254 62 296 96 290 160 C280 120 240 100 200 100 C160 100 120 120 110 160Z'};
const LONG_BACK='M98 170 C88 70 150 42 200 42 C250 42 312 70 302 170 L308 300 C280 322 120 322 92 300Z';

/** Draw the avatar centred at (cx,cy), `size` px wide. t = seconds (drives blink/bounce/wave), talk = 0..1 mouth opening. */
export function drawAvatar(x:X,c:AvCfg,cx:number,cy:number,size:number,t:number,o:{talk?:number;gesture?:Gesture}={}){
  const talk=o.talk||0,g=o.gesture??c.gesture,sp=c.speed||1,dy=c.bounce?Math.sin(t*3*sp)*3+talk*3:0,blink=((t*1000)/sp)%3600<130;
  x.save();x.translate(cx-size/2,cy-size/2);x.scale(size/400,size/400);x.lineJoin='round';x.lineCap='round';
  const frame=new Path2D(c.bgOn?'M56 0H344Q400 0 400 56V344Q400 400 344 400H56Q0 400 0 344V56Q0 0 56 0Z':'M0 0H400V400H0Z');x.clip(frame);
  if(c.bgOn){x.fillStyle=c.bg;x.fill(frame)}
  x.translate(0,dy);
  if(c.hairStyle==='long')path(x,LONG_BACK,c.hair);
  path(x,'M26 410 C36 336 108 304 200 304 C292 304 364 336 374 410 Z',c.blazer);
  const arm=(mirror:boolean)=>{
    if(g==='none')return;x.save();if(mirror){x.translate(400,0);x.scale(-1,1)}
    const ph=t*7*sp;let a=0.12,L=118,ox=0,oy=0;
    if(c.motion==='wave')a=0.15+0.22*Math.sin(ph);else if(c.motion==='bounce')L=118+12*Math.sin(ph);else if(c.motion==='circle'){ox=12*Math.cos(ph);oy=12*Math.sin(ph)}
    const sx=322,sy=392,hx=sx+L*Math.sin(a)+ox,hy=sy-L*Math.cos(a)+oy;
    rod(x,sx,sy,hx,hy+10,28,c.blazer);x.save();x.translate(hx,hy);x.rotate(a*0.8);hand(x,g,c.skin);x.restore();x.restore()};
  if(c.hand!=='left')arm(false);if(c.hand!=='right')arm(true);
  path(x,'M170 262 L170 312 Q200 334 230 312 L230 262 Z',c.skin);
  path(x,'M156 298 L244 298 L222 410 L178 410 Z',c.shirt);path(x,'M156 298 L200 352 L154 340 Z',c.shirt);path(x,'M244 298 L200 352 L246 340 Z',c.shirt);
  path(x,'M156 300 L186 380 L164 410 M244 300 L214 380 L236 410');
  if(c.tie){path(x,'M191 348 L209 348 L206 366 L194 366 Z',c.tieColor);path(x,'M194 366 L206 366 L216 410 L184 410 Z',c.tieColor);path(x,'M193 378 L207 372 M190 392 L211 384 M188 404 L214 396',undefined,3.5,'#dbe8ff')}
  for(const ex of [116,284]){x.beginPath();x.arc(ex,188,15,0,7);x.fillStyle=c.skin;x.fill();x.lineWidth=4.5;x.strokeStyle=K;x.stroke()}
  path(x,'M112 172 C112 102 150 80 200 80 C250 80 288 102 288 172 C288 242 252 282 200 282 C148 282 112 242 112 172 Z',c.skin);
  if(c.hairStyle!=='bald'){path(x,HAIR[c.hairStyle]||HAIR.slick,c.hair);if(c.hairStyle==='slick')path(x,'M142 92 C170 72 232 70 262 92 M132 112 C160 92 240 90 270 112',undefined,3,'rgba(255,255,255,.35)')}
  const by=c.expr==='surprised'?-8:0;path(x,'M146 '+(152+by)+' Q166 '+(142+by)+' 188 '+(151+by)+' M212 '+(151+by)+' Q234 '+(142+by)+' 254 '+(152+by),undefined,7,c.hair==='#17171d'?K:c.hair);
  if(blink)path(x,'M150 174 Q168 181 188 174 M212 174 Q231 181 250 174',undefined,4);
  else{path(x,'M150 174 Q168 164 188 173 Q169 183 150 174 Z','#fff',3.5);path(x,'M212 173 Q232 164 250 174 Q231 183 212 173 Z','#fff',3.5);for(const ex of [169,231]){x.beginPath();x.arc(ex,174,c.expr==='surprised'?7:5.5,0,7);x.fillStyle=c.eye;x.fill()}}
  if(c.glasses==='round'){path(x,'M143 174 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0Z M205 174 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0Z M195 172 Q200 166 205 172 M143 172 L116 176 M257 172 L284 176','rgba(255,255,255,.1)',4.5,c.glassColor)}
  if(c.glasses==='square'){path(x,'M146 156 H192 Q196 156 196 160 V188 Q196 192 192 192 H146 Q142 192 142 188 V160 Q142 156 146 156Z M208 156 H254 Q258 156 258 160 V188 Q258 192 254 192 H208 Q204 192 204 188 V160 Q204 156 208 156Z M196 168 H204 M142 168 L116 174 M258 168 L284 174','rgba(255,255,255,.1)',4.5,c.glassColor)}
  path(x,'M200 180 Q193 206 199 214 Q207 217 212 210',undefined,3.5);
  const open=Math.max(talk*16,c.expr==='happy'?14:0);
  if(c.expr==='surprised')path(x,'M190 246 a10 14 0 1 0 20 0 a10 14 0 1 0 -20 0Z','#7a2a2a',4);
  else if(open>1.5)path(x,'M178 238 Q200 '+(238+open*1.6)+' 222 238 Q200 236 178 238Z','#7a2a2a',4);
  else if(c.expr==='cool')path(x,'M184 242 L216 242',undefined,5,'#a4453f');
  else path(x,'M180 240 Q200 252 220 240',undefined,5,'#a4453f');
  if(c.blush)for(const bx of [148,252]){x.beginPath();x.arc(bx,218,14,0,7);x.fillStyle='rgba(255,143,143,.38)';x.fill()}
  if(c.moles)for(const [mx,my,r] of [[266,206,3],[256,130,2.6]]){x.beginPath();x.arc(mx,my,r,0,7);x.fillStyle='#3a2418';x.fill()}
  x.restore();
}

export function AvatarPreview({cfg,size=160,gesture,talk=0}:{cfg:AvCfg;size?:number;gesture?:Gesture;talk?:number}){
  const ref=useRef<HTMLCanvasElement>(null),cf=useRef(cfg);cf.current=cfg;
  useEffect(()=>{
    let raf=0;const c=ref.current!,dpr=Math.min(2,window.devicePixelRatio||1);c.width=size*dpr;c.height=size*dpr;const x=c.getContext('2d')!;
    const loop=()=>{x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);x.scale(dpr,dpr);const t=performance.now()/1000;drawAvatar(x,cf.current,size/2,size/2,size,t,{talk:talk||(Math.sin(t*2)>0.6?0.5*Math.abs(Math.sin(t*14)):0),gesture});raf=requestAnimationFrame(loop)};
    loop();return()=>cancelAnimationFrame(raf)},[size,gesture,talk]);
  return <canvas ref={ref} style={{width:size,height:size,borderRadius:size*0.14,flex:'none',background:cfg.bgOn?undefined:'rgba(128,128,160,.15)'}}/>;
}
