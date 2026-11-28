// 轻图's own desk toys: 压缩方块, 气泡纸 and 快门相机. Each is a custom element
// that paints into a transparent canvas inside its shadow root, so the desktop
// toy window can hit-test painted pixels (see toy-hit.js) and pass clicks on
// empty space through to whatever is underneath.
//
// Interaction API shared with the desktop window (useToyGesture.js), which
// intercepts pointer events itself so it can tell clicks from window drags:
//   press(clientX, clientY)   pointer went down on the toy
//   release(clientX, clientY) pointer came up without dragging
//   cancelPress()             the press turned into a window drag or was lost
// In the in-app panel the element handles its own pointer events.
//
// Colours are fixed (not theme tokens): the toy floats over arbitrary desktop
// wallpapers, so it uses a white body, graphite ink and the brand blue.

const W=262,H=183;
const INK='#1c1c20',PAPER='#ffffff',BLUE='#2a6af5',BLUE_DEEP='#1d58de',MIST='#e9effd';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const easeOut=t=>1-(1-t)**3;
const rand=(a,b)=>a+Math.random()*(b-a);

class QingtuToy extends HTMLElement{
 constructor(){
  super();
  const root=this.attachShadow({mode:'open'});
  root.innerHTML=`<style>
   :host{display:block;position:relative;aspect-ratio:${W}/${H};-webkit-tap-highlight-color:transparent;user-select:none}
   canvas{display:block;width:100%;height:100%;touch-action:none}
   button{position:absolute;inset:0;margin:0;padding:0;border:0;background:none;opacity:0;cursor:inherit}
   button:focus-visible{opacity:1;outline:2px solid ${BLUE};outline-offset:2px;border-radius:12px}
  </style><canvas part="box"></canvas><button part="button" type="button"></button>`;
  this.canvas=root.querySelector('canvas');
  this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});
  this.button=root.querySelector('button');
  this.frame=0;this.last=0;this.timers=new Set();this.pressing=false;
  this.loop=this.loop.bind(this);
  // In-app panel: the element plays itself. On the desktop the toy window
  // stops these events in its capture phase and calls the API instead.
  this.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   try{this.setPointerCapture(event.pointerId);}catch{}
   this.press(event.clientX,event.clientY);
  });
  this.addEventListener('pointerup',event=>{if(this.pressing)this.release(event.clientX,event.clientY);});
  this.addEventListener('pointercancel',()=>this.cancelPress());
  this.addEventListener('lostpointercapture',()=>{if(this.pressing)this.cancelPress();});
  this.button.addEventListener('keydown',event=>{
   if((event.key==='Enter'||event.key===' ')&&!event.repeat&&!this.pressing){event.preventDefault();const r=this.getBoundingClientRect();this.press(r.left+r.width/2,r.top+r.height/2);}
  });
  this.button.addEventListener('keyup',event=>{
   if((event.key==='Enter'||event.key===' ')&&this.pressing){event.preventDefault();const r=this.getBoundingClientRect();this.release(r.left+r.width/2,r.top+r.height/2);}
  });
 }
 connectedCallback(){
  this.button.setAttribute('aria-label',this.getAttribute('label')||this.toyName);
  this.resize=new ResizeObserver(()=>this.fit());
  this.resize.observe(this);
  this.fit();this.idle?.();
 }
 disconnectedCallback(){
  this.resize?.disconnect();cancelAnimationFrame(this.frame);this.frame=0;
  for(const timer of this.timers)clearTimeout(timer);this.timers.clear();
 }
 later(fn,ms){const timer=setTimeout(()=>{this.timers.delete(timer);fn();},ms);this.timers.add(timer);return timer;}
 fit(){
  const width=this.clientWidth||W,ratio=window.devicePixelRatio||1;
  const pixels=Math.max(1,Math.round(width*ratio)),rows=Math.max(1,Math.round(width*H/W*ratio));
  if(this.canvas.width!==pixels||this.canvas.height!==rows){this.canvas.width=pixels;this.canvas.height=rows;}
  this.scale=pixels/W;this.paint();
 }
 local(clientX,clientY){
  const r=this.getBoundingClientRect();
  return {x:(clientX-r.left)/(r.width||1)*W,y:(clientY-r.top)/(r.height||1)*H};
 }
 // Animate only while something moves; an idle toy costs nothing.
 wake(){if(!this.frame){this.last=performance.now();this.frame=requestAnimationFrame(this.loop);}}
 loop(now){
  const dt=Math.min(.05,(now-this.last)/1000);this.last=now;
  const busy=this.step(dt);this.paint();
  this.frame=busy?requestAnimationFrame(this.loop):0;
 }
 paint(){
  const {ctx,canvas}=this;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(this.scale,0,0,this.scale,0,0);
  ctx.lineJoin='round';ctx.lineCap='round';
  this.draw(ctx);
 }
 caption(ctx,text,x,y,{size=13,alpha=1,color=INK,weight=650}={}){
  if(alpha<=0)return;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.font=`${weight} ${size}px -apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  // A white halo keeps text legible on any wallpaper.
  ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.strokeText(text,x,y);
  ctx.fillStyle=color;ctx.fillText(text,x,y);
  ctx.restore();
 }
 press(){this.pressing=true;this.wake();}
 release(){this.pressing=false;this.wake();}
 cancelPress(){this.pressing=false;this.wake();}
}

// ── 压缩方块 ───────────────────────────────────────────────────────────────
// The app icon's raised blue square, alive. Holding squashes it while a size
// readout "compresses" from 30 MB toward 1 KB; at the limit it bursts into
// pixels. Releasing springs it back with a wobble and a grin.
const formatSize=bytes=>bytes>=1e6?`${(bytes/1e6).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1e3))} KB`;

class SquishToy extends QingtuToy{
 constructor(){super();this.toyName='压缩方块';this.v=0;this.vel=0;this.held=0;this.happy=0;this.blink=0;this.readout=0;this.bits=[];this.rings=[];this.maxed=false;}
 idle(){
  const next=()=>this.later(()=>{this.blink=1;this.wake();next();},rand(2600,5200));
  next();
 }
 press(x,y){super.press(x,y);this.held=0;this.maxed=false;this.readout=1;}
 release(x,y){
  super.release(x,y);
  this.happy=1;this.rings.push({t:0});
 }
 cancelPress(){super.cancelPress();this.held=0;}
 burst(){
  for(let i=0;i<18;i++){
   const a=rand(-Math.PI*.95,-Math.PI*.05),speed=rand(90,210);
   this.bits.push({x:140+rand(-30,30),y:120+rand(-10,10),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:rand(4,8),spin:rand(-8,8),r:0,life:1,blue:Math.random()<.6});
  }
 }
 step(dt){
  if(this.pressing){
   this.held=Math.min(1,this.held+dt/1.25);
   if(this.held>=1&&!this.maxed){this.maxed=true;this.burst();}
  }
  const target=this.pressing?.25+.75*easeOut(this.held):0;
  // Damped spring: overshoots on release, so the square stretches and wobbles.
  this.vel+=((target-this.v)*260-this.vel*(this.pressing?22:9))*dt;
  this.v+=this.vel*dt;
  this.happy=Math.max(0,this.happy-dt/1.1);
  this.blink=Math.max(0,this.blink-dt/.16);
  if(!this.pressing)this.readout=Math.max(0,this.readout-dt/1.2);
  for(const b of this.bits){b.vy+=420*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.r+=b.spin*dt;b.life-=dt/1.1;}
  this.bits=this.bits.filter(b=>b.life>0);
  for(const ring of this.rings)ring.t+=dt/.55;
  this.rings=this.rings.filter(ring=>ring.t<1);
  return this.pressing||Math.abs(this.v-target)>.002||Math.abs(this.vel)>.01||this.happy>0||this.blink>0||this.readout>0||this.bits.length||this.rings.length;
 }
 draw(ctx){
  const G=160,S=92,CX=146,v=this.v;
  const sx=1+.24*v,sy=1-.44*v;
  const w=S*sx,h=S*sy,left=CX-w/2,top=G-h;
  // Ground shadow.
  ctx.fillStyle='rgba(28,28,32,.16)';
  ctx.beginPath();ctx.ellipse(CX-6,G+7,w*.58+10,6+2*v,0,0,Math.PI*2);ctx.fill();
  // Release rings.
  for(const ring of this.rings){
   ctx.strokeStyle=`rgba(42,106,245,${.55*(1-ring.t)})`;ctx.lineWidth=2.5;
   ctx.beginPath();ctx.ellipse(CX,G,40+ring.t*80,8+ring.t*16,0,0,Math.PI*2);ctx.stroke();
  }
  // Back square (the icon's white outlined square), squashes half as much.
  const bw=S*(1+.12*v),bh=S*(1-.22*v),bx=CX-w/2-20,by=G-bh-16;
  ctx.fillStyle=PAPER;ctx.strokeStyle=INK;ctx.lineWidth=3;
  ctx.beginPath();ctx.roundRect(bx,by,bw,bh,20);ctx.fill();ctx.stroke();
  // Front square.
  const gradient=ctx.createLinearGradient(0,top,0,G);
  gradient.addColorStop(0,'#3b7bff');gradient.addColorStop(1,BLUE_DEEP);
  ctx.fillStyle=gradient;ctx.strokeStyle=INK;ctx.lineWidth=3;
  ctx.beginPath();ctx.roundRect(left,top,w,h,22);ctx.fill();ctx.stroke();
  // Shine.
  ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(left+16,top+18);ctx.quadraticCurveTo(left+16,top+12,left+26,top+12);ctx.stroke();
  // Face.
  const ey=top+h*.44,ex=13+5*v,my=top+h*.66;
  ctx.strokeStyle=INK;ctx.fillStyle=INK;ctx.lineWidth=3;
  if(this.pressing&&this.held>.12){
   for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(CX+side*ex-5*side,ey-5);ctx.lineTo(CX+side*ex+3*side,ey);ctx.lineTo(CX+side*ex-5*side,ey+5);ctx.stroke();}
   ctx.beginPath();ctx.ellipse(CX,my+2,5,3+3*this.held,0,0,Math.PI*2);ctx.fill();
  }else if(this.happy>0){
   for(const side of [-1,1]){ctx.beginPath();ctx.arc(CX+side*ex,ey+3,5.5,Math.PI*1.1,Math.PI*1.9);ctx.stroke();}
   ctx.fillStyle=PAPER;ctx.beginPath();ctx.moveTo(CX-12,my-2);ctx.quadraticCurveTo(CX,my+16,CX+12,my-2);ctx.closePath();ctx.fill();ctx.stroke();
  }else{
   const open=1-Math.sin(this.blink*Math.PI);
   for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(CX+side*ex,ey,4.6,Math.max(.8,5.4*open),0,0,Math.PI*2);ctx.fill();}
   ctx.beginPath();ctx.arc(CX,my-4,7,Math.PI*.2,Math.PI*.8);ctx.stroke();
  }
  // Cheeks.
  ctx.fillStyle='rgba(255,255,255,.28)';
  for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(CX+side*(ex+12),ey+11,5,3,0,0,Math.PI*2);ctx.fill();}
  // Flying pixels.
  for(const b of this.bits){
   ctx.save();ctx.globalAlpha=clamp(b.life*1.4,0,1);ctx.translate(b.x,b.y);ctx.rotate(b.r);
   ctx.fillStyle=b.blue?BLUE:PAPER;ctx.strokeStyle=INK;ctx.lineWidth=1.5;
   ctx.beginPath();ctx.rect(-b.size/2,-b.size/2,b.size,b.size);ctx.fill();ctx.stroke();ctx.restore();
  }
  // Size readout.
  if(this.readout>0){
   const bytes=30e6*(1e3/30e6)**easeOut(this.held);
   this.caption(ctx,this.maxed?'压缩到极限！':formatSize(bytes),CX-8,Math.max(14,top-24),{alpha:Math.min(1,this.readout*1.6),color:this.maxed?BLUE_DEEP:INK});
  }
 }
}

// ── 气泡纸 ─────────────────────────────────────────────────────────────────
// Fifteen bubbles to pop. When the sheet is done a fresh one slides in.
const COLS=5,ROWS=3,BUBBLE=16.5;
const sheetBubbles=()=>Array.from({length:COLS*ROWS},(_,i)=>({c:i%COLS,r:Math.floor(i/COLS),popped:false,t:0,tilt:rand(-.6,.6)}));

class BubbleToy extends QingtuToy{
 constructor(){super();this.toyName='气泡纸';this.bubbles=sheetBubbles();this.sparks=[];this.slide=0;this.sliding=false;this.jiggle=0;this.total=0;}
 centre(b,offset=0){return {x:20+23+b.c*45+offset,y:30+22+b.r*42};}
 press(clientX,clientY){
  super.press(clientX,clientY);
  if(this.sliding)return;
  const {x,y}=this.local(clientX,clientY);
  // The nearest unpopped bubble within half the spacing, so presses between
  // bubbles still pop one.
  let hit=null,best=22;
  for(const b of this.bubbles){if(b.popped)continue;const p=this.centre(b),d=Math.hypot(x-p.x,y-p.y);if(d<best){best=d;hit=b;}}
  if(!hit){this.jiggle=1;this.wake();return;}
  hit.popped=true;hit.t=0;this.total++;
  const p=this.centre(hit);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2+rand(-.2,.2);this.sparks.push({x:p.x,y:p.y,a,d:BUBBLE*.6,life:1});}
  if(this.bubbles.every(b=>b.popped))this.later(()=>{this.sliding=true;this.slide=0;this.wake();},450);
  this.wake();
 }
 step(dt){
  for(const b of this.bubbles)if(b.popped&&b.t<1)b.t=Math.min(1,b.t+dt/.3);
  for(const s of this.sparks){s.d+=dt*60;s.life-=dt/.32;}
  this.sparks=this.sparks.filter(s=>s.life>0);
  this.jiggle=Math.max(0,this.jiggle-dt/.35);
  if(this.sliding){
   this.slide=Math.min(1,this.slide+dt/.75);
   if(this.slide>=1){this.sliding=false;this.slide=0;this.bubbles=sheetBubbles();}
  }
  return this.sparks.length||this.jiggle>0||this.sliding||this.bubbles.some(b=>b.popped&&b.t<1);
 }
 drawSheet(ctx,offset,bubbles){
  const wobble=Math.sin(this.jiggle*Math.PI*4)*this.jiggle*2.5;
  ctx.save();ctx.translate(offset+wobble,0);
  ctx.fillStyle='rgba(255,255,255,.94)';ctx.strokeStyle=INK;ctx.lineWidth=2.5;
  ctx.beginPath();ctx.roundRect(20,30,226,128,16);ctx.fill();ctx.stroke();
  for(const b of bubbles){
   const {x,y}=this.centre(b);
   if(!b.popped||b.t<.35){
    // Inflated (or bulging just before it bursts).
    const grow=b.popped?1+.35*Math.sin(b.t/.35*Math.PI/2):1;
    const g=ctx.createRadialGradient(x-5,y-6,2,x,y,BUBBLE*grow);
    g.addColorStop(0,'#ffffff');g.addColorStop(1,'#cfdcfb');
    ctx.fillStyle=g;ctx.strokeStyle=INK;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y,BUBBLE*grow,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(x,y,BUBBLE*grow*.62,Math.PI*1.1,Math.PI*1.45);ctx.stroke();
   }else{
    // Flattened, crinkled plastic.
    ctx.strokeStyle='#aeb6c6';ctx.lineWidth=1.6;
    ctx.beginPath();
    for(let i=0;i<=10;i++){const a=i/10*Math.PI*2,r=BUBBLE*(.82+(i%2?.12:-.05));const px=x+Math.cos(a+b.tilt)*r,py=y+Math.sin(a+b.tilt)*r*.9;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
    ctx.closePath();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-6,y-2+b.tilt*3);ctx.lineTo(x+1,y+3);ctx.lineTo(x+7,y-3-b.tilt*2);ctx.stroke();
   }
  }
  ctx.restore();
 }
 draw(ctx){
  const shift=this.sliding?easeOut(this.slide):0;
  this.drawSheet(ctx,-shift*280,this.bubbles);
  if(this.sliding)this.drawSheet(ctx,(1-shift)*280,sheetBubbles());
  ctx.strokeStyle=BLUE;ctx.lineWidth=2.2;
  for(const s of this.sparks){
   ctx.globalAlpha=clamp(s.life,0,1);
   ctx.beginPath();ctx.moveTo(s.x+Math.cos(s.a)*s.d,s.y+Math.sin(s.a)*s.d);ctx.lineTo(s.x+Math.cos(s.a)*(s.d+6),s.y+Math.sin(s.a)*(s.d+6));ctx.stroke();
  }
  ctx.globalAlpha=1;
  const left=this.bubbles.filter(b=>!b.popped).length;
  this.caption(ctx,this.sliding?'换一张':`已捏 ${this.total} 个`,203,172,{size:11.5,weight:600,color:'#4a4a55'});
  if(!this.sliding&&left===0)this.caption(ctx,'全部捏完！',133,94,{size:15,color:BLUE_DEEP});
 }
}

// ── 快门相机 ───────────────────────────────────────────────────────────────
// Click to shoot: the aperture snaps shut, the flash fires and a polaroid with
// a random little landscape prints from the top. Hold for burst mode.
const SKIES=['#9cc4ff','#ffc9a8','#b8ecd2','#dccafe','#ffe08a','#a9e4f5'];

class ShutterToy extends QingtuToy{
 constructor(){super();this.toyName='快门相机';this.close=0;this.flash=0;this.knob=0;this.count=0;this.photos=[];this.burstTimer=null;this.glint=0;}
 idle(){
  const next=()=>this.later(()=>{this.glint=1;this.wake();next();},rand(3500,7000));
  next();
 }
 shoot(){
  this.count++;this.close=1;this.flash=1;this.knob=1;
  this.photos.push({t:0,sky:SKIES[Math.floor(Math.random()*SKIES.length)],sun:Math.random()<.5,hill:rand(.3,.7),tilt:rand(-.22,.22),drift:rand(-30,30)});
  if(this.photos.length>4)this.photos.shift();
  this.wake();
 }
 press(x,y){
  super.press(x,y);this.shoot();
  clearTimeout(this.burstTimer);
  const burst=()=>{this.burstTimer=this.later(()=>{if(!this.pressing)return;this.shoot();burst();},260);};
  this.burstTimer=this.later(()=>{if(this.pressing)burst();},420);
 }
 cancelPress(){super.cancelPress();clearTimeout(this.burstTimer);}
 release(x,y){super.release(x,y);clearTimeout(this.burstTimer);}
 step(dt){
  this.close=Math.max(0,this.close-dt/.2);
  this.flash=Math.max(0,this.flash-dt/.3);
  this.knob=Math.max(0,this.knob-dt/.18);
  this.glint=Math.max(0,this.glint-dt/.9);
  for(const p of this.photos)p.t+=dt/1.9;
  this.photos=this.photos.filter(p=>p.t<1);
  return this.close>0||this.flash>0||this.knob>0||this.glint>0||this.photos.length>0;
 }
 drawPhoto(ctx,p){
  // Prints upward out of the body, pauses, then drifts off and fades.
  const t=p.t,rise=easeOut(clamp(t/.35,0,1)),away=clamp((t-.55)/.45,0,1);
  const x=131+p.drift*away,y=58-52*rise-40*away*away,rot=p.tilt*away;
  ctx.save();ctx.globalAlpha=1-away;ctx.translate(x,y);ctx.rotate(rot);
  ctx.fillStyle=PAPER;ctx.strokeStyle=INK;ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-28,0,56,62,4);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.rect(-23,5,46,40);ctx.save();ctx.clip();
  ctx.fillStyle=p.sky;ctx.fillRect(-23,5,46,40);
  ctx.fillStyle=p.sun?PAPER:BLUE;ctx.beginPath();ctx.arc(10,17,6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=BLUE;ctx.beginPath();ctx.moveTo(-26,45);ctx.quadraticCurveTo(-10,45-30*p.hill,4,36);ctx.quadraticCurveTo(16,28,26,40);ctx.lineTo(26,48);ctx.lineTo(-26,48);ctx.fill();
  ctx.fillStyle=INK;ctx.beginPath();ctx.moveTo(-26,48);ctx.quadraticCurveTo(-4,36,26,46);ctx.lineTo(26,48);ctx.fill();
  ctx.restore();
  ctx.strokeStyle=INK;ctx.lineWidth=1.5;ctx.strokeRect(-23,5,46,40);
  ctx.restore();
 }
 draw(ctx){
  for(const p of this.photos)this.drawPhoto(ctx,p);
  const lx=131,ly=114;
  // Flash glow.
  if(this.flash>0){
   const g=ctx.createRadialGradient(lx,ly,10,lx,ly,120);
   g.addColorStop(0,`rgba(255,255,255,${.95*this.flash})`);g.addColorStop(1,'rgba(255,255,255,0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(lx,ly,120,0,Math.PI*2);ctx.fill();
  }
  // Body.
  ctx.fillStyle=INK;ctx.strokeStyle=INK;ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(70,48,40,16,6);ctx.fill();
  const press=this.knob*4;
  ctx.fillStyle=BLUE;ctx.beginPath();ctx.roundRect(172,46+press,28,14-press,5);ctx.fill();ctx.strokeStyle=INK;ctx.stroke();
  ctx.fillStyle='#26262b';ctx.beginPath();ctx.roundRect(46,58,170,108,18);ctx.fill();
  ctx.strokeStyle=INK;ctx.lineWidth=2.5;ctx.stroke();
  ctx.fillStyle='#34343b';ctx.beginPath();ctx.roundRect(46,58,170,24,{upperLeft:18,upperRight:18,lowerLeft:0,lowerRight:0});ctx.fill();
  // Viewfinder and indicator.
  ctx.fillStyle='#4b5876';ctx.beginPath();ctx.roundRect(60,64,24,12,3);ctx.fill();
  ctx.fillStyle=this.flash>0?'#8fb2ff':BLUE;ctx.beginPath();ctx.arc(200,70,3.5,0,Math.PI*2);ctx.fill();
  // Lens with a six-blade aperture.
  ctx.fillStyle='#3a3a42';ctx.beginPath();ctx.arc(lx,ly,42,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#55555f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(lx,ly,36,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#121216';ctx.beginPath();ctx.arc(lx,ly,33,0,Math.PI*2);ctx.fill();
  const open=26*(1-Math.sin(this.close*Math.PI/2)*.92),spin=this.close*.7;
  const glass=ctx.createRadialGradient(lx-8,ly-10,2,lx,ly,open+2);
  glass.addColorStop(0,'#5f8dff');glass.addColorStop(.55,'#1d3576');glass.addColorStop(1,'#0b1124');
  ctx.fillStyle=glass;ctx.beginPath();
  for(let i=0;i<6;i++){const a=spin+i/6*Math.PI*2;const px=lx+Math.cos(a)*open,py=ly+Math.sin(a)*open;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
  ctx.closePath();ctx.fill();
  ctx.strokeStyle='#2c2c33';ctx.lineWidth=1.4;
  for(let i=0;i<6;i++){
   const a=spin+i/6*Math.PI*2;
   ctx.beginPath();ctx.moveTo(lx+Math.cos(a)*open,ly+Math.sin(a)*open);ctx.lineTo(lx+Math.cos(a+.9)*33,ly+Math.sin(a+.9)*33);ctx.stroke();
  }
  // Glint.
  ctx.strokeStyle=`rgba(255,255,255,${.35+.5*this.glint})`;ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(lx,ly,24,Math.PI*1.15,Math.PI*1.4);ctx.stroke();
  // Counter.
  ctx.fillStyle='#8c8c99';ctx.font='600 9px ui-monospace,Menlo,Consolas,monospace';ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillText(`No.${String(this.count).padStart(3,'0')}`,58,154);
  if(this.flash>.4)this.caption(ctx,'咔嚓！',214,34,{size:14,color:BLUE_DEEP,alpha:Math.min(1,(this.flash-.4)*3)});
 }
}

export const TOY_ELEMENTS={squish:'qt-squish',bubbles:'qt-bubbles',shutter:'qt-shutter'};
for(const [tag,element] of [['qt-squish',SquishToy],['qt-bubbles',BubbleToy],['qt-shutter',ShutterToy]]){
 if(!customElements.get(tag))customElements.define(tag,element);
}
