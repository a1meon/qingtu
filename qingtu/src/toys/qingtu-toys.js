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

// Per-user records (best score, best RPM). Storage can be unavailable.
const remember=(key,fallback=0)=>{try{return Number(localStorage.getItem('qingtu.toy.'+key))||fallback;}catch{return fallback;}};
const store=(key,value)=>{try{localStorage.setItem('qingtu.toy.'+key,String(value));}catch{}};

// ── 吃图怪 ─────────────────────────────────────────────────────────────────
// A round critter that eats image files. Its eyes follow the mouse; each press
// drops a file into its mouth. Five files make it burp out a tiny 1 KB file.
const FILES=[{tag:'JPG',color:'#ff8a5b'},{tag:'PNG',color:'#2a6af5'},{tag:'WEBP',color:'#22b07d'},{tag:'GIF',color:'#b26bff'}];

class MunchToy extends QingtuToy{
 constructor(){
  super();this.toyName='吃图怪';
  this.files=[];this.crumbs=[];this.spits=[];this.eaten=0;this.belly=0;this.mouth=0;this.chew=0;this.burp=0;this.blink=0;
  this.look={x:0,y:0};this.lookTarget={x:0,y:0};this.hungry=0;this.lastMeal=performance.now();this.popup=null;
  this.onMove=event=>{
   const r=this.getBoundingClientRect();if(!r.width)return;
   const x=(event.clientX-r.left)/r.width*W-131,y=(event.clientY-r.top)/r.height*H-112;
   const d=Math.hypot(x,y)||1,k=Math.min(1,d/90);
   const next={x:x/d*k,y:y/d*k};
   if(Math.abs(next.x-this.lookTarget.x)+Math.abs(next.y-this.lookTarget.y)>.04){this.lookTarget=next;this.wake();}
  };
 }
 connectedCallback(){super.connectedCallback();window.addEventListener('mousemove',this.onMove);}
 disconnectedCallback(){super.disconnectedCallback();window.removeEventListener('mousemove',this.onMove);}
 idle(){
  const blink=()=>this.later(()=>{this.blink=1;this.wake();blink();},rand(2200,4800));
  const hungry=()=>this.later(()=>{if(performance.now()-this.lastMeal>9000&&!this.files.length){this.hungry=1;this.wake();}hungry();},3000);
  blink();hungry();
 }
 press(clientX,clientY){
  super.press(clientX,clientY);
  if(this.files.length>=6)return;
  const {x}=this.local(clientX,clientY),kind=FILES[Math.floor(Math.random()*FILES.length)];
  this.files.push({x:clamp(x,40,222),y:-24,vx:0,vy:rand(30,70),rot:rand(-.5,.5),spin:rand(-3,3),size:rand(1.2,8.8),...kind});
  this.hungry=0;this.lastMeal=performance.now();
 }
 step(dt){
  const mx=131,my=126;
  let near=0;
  for(const f of this.files){
   // Gravity plus a gentle pull toward the mouth, so every file lands in it.
   f.vy+=520*dt;f.vx+=(mx-f.x)*4*dt;f.vx*=Math.exp(-3*dt);
   f.x+=f.vx*dt;f.y+=f.vy*dt;f.rot+=f.spin*dt;
   const d=Math.hypot(f.x-mx,f.y-my);
   if(d<90)near=Math.max(near,1-d/90);
   if(f.y>=my-6&&Math.abs(f.x-mx)<40){
    f.eaten=true;this.eaten++;this.belly++;this.chew=1;
    this.popup={text:`+${f.size.toFixed(1)} MB`,t:1};
    for(let i=0;i<6;i++)this.crumbs.push({x:mx+rand(-14,14),y:my,vx:rand(-70,70),vy:rand(-120,-50),life:1,color:f.color});
    if(this.belly>=5)this.later(()=>{this.belly=0;this.burp=1;this.popup={text:'嗝～',t:1.3};
     this.spits.push({x:mx+30,y:my-6,vx:rand(80,120)*(Math.random()<.5?-1:1),vy:-170,rot:0,life:1});this.wake();},380);
   }
  }
  this.files=this.files.filter(f=>!f.eaten&&f.y<H+40);
  const target=Math.max(near,this.files.length?.15:0);
  this.mouth+=(target-this.mouth)*Math.min(1,dt*14);
  this.chew=Math.max(0,this.chew-dt/.45);this.burp=Math.max(0,this.burp-dt/.9);this.blink=Math.max(0,this.blink-dt/.15);
  if(this.popup){this.popup.t-=dt/1.1;if(this.popup.t<=0)this.popup=null;}
  this.look.x+=(this.lookTarget.x-this.look.x)*Math.min(1,dt*12);this.look.y+=(this.lookTarget.y-this.look.y)*Math.min(1,dt*12);
  for(const c of this.crumbs){c.vy+=400*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.life-=dt/.7;}
  this.crumbs=this.crumbs.filter(c=>c.life>0);
  for(const p of this.spits){p.vy+=380*dt;p.x+=p.vx*dt;p.y=Math.min(158,p.y+p.vy*dt);if(p.y>=158){p.vy*=-.45;p.vx*=.8;}p.rot+=p.vx*.02*dt;p.life-=dt/1.8;}
  this.spits=this.spits.filter(p=>p.life>0);
  const eyesMoving=Math.abs(this.lookTarget.x-this.look.x)+Math.abs(this.lookTarget.y-this.look.y)>.01;
  return this.files.length||this.crumbs.length||this.spits.length||this.chew>0||this.burp>0||this.blink>0||this.popup||eyesMoving||Math.abs(this.mouth-target)>.01;
 }
 drawFile(ctx,f,scale=1){
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rot);ctx.scale(scale,scale);
  ctx.fillStyle=PAPER;ctx.strokeStyle=INK;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-12,-15);ctx.lineTo(5,-15);ctx.lineTo(12,-8);ctx.lineTo(12,15);ctx.lineTo(-12,15);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(5,-15);ctx.lineTo(5,-8);ctx.lineTo(12,-8);ctx.stroke();
  ctx.fillStyle=f.color;ctx.beginPath();ctx.roundRect(-10,2,20,9,2);ctx.fill();
  ctx.fillStyle=PAPER;ctx.font='700 6.5px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(f.tag,0,6.8);
  ctx.restore();
 }
 draw(ctx){
  const CX=131,G=164,puff=this.chew*Math.sin(this.chew*Math.PI*6)*.06,burp=this.burp*Math.sin(this.burp*Math.PI)*.12;
  const rx=52+this.belly*2.4+puff*30,ry=46+this.belly*1.6-burp*18,cy=G-ry;
  ctx.fillStyle='rgba(28,28,32,.15)';ctx.beginPath();ctx.ellipse(CX,G+5,rx*.9,6,0,0,Math.PI*2);ctx.fill();
  // Feet.
  ctx.fillStyle=BLUE_DEEP;ctx.strokeStyle=INK;ctx.lineWidth=2.5;
  for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(CX+side*rx*.45,G-2,12,7,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
  // Body.
  const body=ctx.createRadialGradient(CX-18,cy-20,8,CX,cy,rx+10);
  body.addColorStop(0,'#5d95ff');body.addColorStop(1,BLUE_DEEP);
  ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(CX,cy,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  // Little ear squares (the icon's layers).
  ctx.fillStyle=PAPER;
  ctx.beginPath();ctx.roundRect(CX-rx*.62,cy-ry-6,16,16,4);ctx.fill();ctx.stroke();
  ctx.fillStyle='#8fb2ff';ctx.beginPath();ctx.roundRect(CX+rx*.62-16,cy-ry-6,16,16,4);ctx.fill();ctx.stroke();
  // Eyes.
  const ey=cy-ry*.32,open=1-Math.sin(this.blink*Math.PI);
  for(const side of [-1,1]){
   const ex=CX+side*17;
   ctx.fillStyle=PAPER;ctx.strokeStyle=INK;ctx.lineWidth=2.2;
   ctx.beginPath();ctx.ellipse(ex,ey,11,11*Math.max(.12,open),0,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(open>.3&&this.burp<.5){ctx.fillStyle=INK;ctx.beginPath();ctx.arc(ex+this.look.x*5,ey+this.look.y*5,4.6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=PAPER;ctx.beginPath();ctx.arc(ex+this.look.x*5-1.5,ey+this.look.y*5-1.8,1.4,0,Math.PI*2);ctx.fill();}
   if(this.burp>=.5){ctx.strokeStyle=INK;ctx.beginPath();ctx.moveTo(ex-5,ey-2);ctx.lineTo(ex,ey+2);ctx.lineTo(ex+5,ey-2);ctx.stroke();}
  }
  // Mouth: opens as food approaches, chomps after.
  const my=cy+ry*.28,open2=Math.max(this.mouth,this.burp*.8),chomp=this.chew>0?Math.abs(Math.sin(this.chew*Math.PI*3)):0;
  const mh=4+22*open2*(1-chomp*.8),mw=26+10*open2;
  ctx.fillStyle='#14142a';ctx.strokeStyle=INK;ctx.lineWidth=2.5;
  ctx.beginPath();ctx.ellipse(CX,my,mw/2,mh/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  if(mh>10){ctx.fillStyle='#ff7b8a';ctx.beginPath();ctx.ellipse(CX,my+mh*.22,mw*.26,mh*.2,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=PAPER;ctx.beginPath();ctx.rect(CX-6,my-mh/2,5,5);ctx.rect(CX+1,my-mh/2,5,5);ctx.fill();}
  ctx.fillStyle='rgba(255,170,190,.55)';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(CX+side*33,ey+14,7,4,0,0,Math.PI*2);ctx.fill();}
  for(const f of this.files)this.drawFile(ctx,f);
  for(const c of this.crumbs){ctx.globalAlpha=clamp(c.life,0,1);ctx.fillStyle=c.color;ctx.fillRect(c.x-2,c.y-2,4,4);}
  ctx.globalAlpha=1;
  for(const p of this.spits){ctx.save();ctx.globalAlpha=clamp(p.life*1.5,0,1);this.drawFile(ctx,{...p,tag:'1KB',color:BLUE},.6);ctx.restore();}
  if(this.popup)this.caption(ctx,this.popup.text,CX+rx*.75,cy-ry-14,{size:13,alpha:Math.min(1,this.popup.t*2),color:this.popup.text==='嗝～'?INK:BLUE_DEEP});
  if(this.hungry&&!this.files.length&&!this.popup)this.caption(ctx,'饿了…',CX-rx*.8,cy-ry-12,{size:12,weight:600,color:'#4a4a55'});
  this.caption(ctx,`已吃 ${this.eaten} 张`,CX,G+14,{size:10.5,weight:600,color:'#4a4a55'});
 }
}

// ── 调色陀螺 ───────────────────────────────────────────────────────────────
// A colour-wheel fidget spinner. Taps add spin, holding brakes; at speed the
// arms blur into a rainbow, and full speed throws sparks. Best RPM is kept.
const MAX_SPIN=62;
class SpinnerToy extends QingtuToy{
 constructor(){super();this.toyName='调色陀螺';this.angle=0;this.speed=0;this.held=0;this.sparks=[];this.best=remember('spinnerBest');this.kick=0;this.record=0;}
 press(x,y){
  super.press(x,y);this.held=0;
  this.speed=Math.min(MAX_SPIN,this.speed+9+this.speed*.12);this.kick=1;
 }
 step(dt){
  if(this.pressing){this.held+=dt;if(this.held>.28)this.speed*=Math.exp(-5*dt);}
  this.speed=Math.max(0,this.speed*Math.exp(-.28*dt)-.35*dt);
  this.angle+=this.speed*dt;this.kick=Math.max(0,this.kick-dt/.25);
  const rpm=Math.round(this.speed*60/(Math.PI*2));
  if(rpm>this.best){this.best=rpm;this.record=1;store('spinnerBest',rpm);}
  this.record=Math.max(0,this.record-dt/1.5);
  if(this.speed>MAX_SPIN*.82)for(let i=0;i<2;i++){const a=rand(0,Math.PI*2);this.sparks.push({x:131+Math.cos(a)*64,y:96+Math.sin(a)*64,vx:Math.cos(a+1.4)*rand(60,140),vy:Math.sin(a+1.4)*rand(60,140),life:1,hue:rand(0,360)});}
  for(const s of this.sparks){s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=120*dt;s.life-=dt/.5;}
  this.sparks=this.sparks.filter(s=>s.life>0);
  return this.speed>.02||this.sparks.length||this.kick>0||this.record>0||this.pressing;
 }
 spinner(ctx,angle,alpha,saturate){
  const CX=131,CY=96;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(CX,CY);ctx.rotate(angle);
  // Arms joined by a rounded triangle body.
  ctx.fillStyle='#26262b';ctx.strokeStyle=INK;ctx.lineWidth=2.5;
  ctx.beginPath();
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3-Math.PI/2;ctx.lineTo(Math.cos(a)*44,Math.sin(a)*44);}
  ctx.closePath();ctx.lineJoin='round';ctx.lineWidth=30;ctx.stroke();ctx.lineWidth=2.5;
  for(let i=0;i<3;i++){
   const a=i*Math.PI*2/3-Math.PI/2,x=Math.cos(a)*44,y=Math.sin(a)*44;
   const hue=(i*120+angle*30*saturate)%360;
   ctx.fillStyle=`hsl(${hue} ${70+25*saturate}% ${58}%)`;ctx.strokeStyle=INK;
   ctx.beginPath();ctx.arc(x,y,19,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.fillStyle='rgba(255,255,255,.45)';ctx.beginPath();ctx.arc(x-6,y-6,5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
 }
 draw(ctx){
  const CX=131,CY=96,blur=clamp(this.speed/MAX_SPIN,0,1);
  // Rainbow ring at speed.
  if(blur>.35){
   const ring=ctx.createConicGradient(this.angle,CX,CY);
   for(let i=0;i<=6;i++)ring.addColorStop(i/6,`hsla(${i*60} 90% 60% / ${(blur-.35)*1.2})`);
   ctx.strokeStyle=ring;ctx.lineWidth=36;ctx.beginPath();ctx.arc(CX,CY,44,0,Math.PI*2);ctx.stroke();
  }
  const ghosts=Math.round(blur*5);
  for(let i=ghosts;i>=1;i--)this.spinner(ctx,this.angle-i*this.speed*.006,.18,blur);
  this.spinner(ctx,this.angle,1,blur);
  // Bearing: the app icon's two squares.
  ctx.save();ctx.translate(CX,CY);ctx.rotate(this.angle*.2);
  ctx.fillStyle=PAPER;ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-13,-13,18,18,4);ctx.fill();ctx.stroke();
  ctx.fillStyle=BLUE;ctx.beginPath();ctx.roundRect(-5,-5,18,18,4);ctx.fill();ctx.stroke();
  ctx.restore();
  if(this.kick>0){ctx.strokeStyle=`rgba(42,106,245,${this.kick})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(CX,CY,72+(1-this.kick)*10,-.6,.6);ctx.stroke();ctx.beginPath();ctx.arc(CX,CY,72+(1-this.kick)*10,Math.PI-.6,Math.PI+.6);ctx.stroke();}
  for(const s of this.sparks){ctx.globalAlpha=clamp(s.life,0,1);ctx.fillStyle=`hsl(${s.hue} 95% 60%)`;ctx.beginPath();ctx.arc(s.x,s.y,2.4,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;
  const rpm=Math.round(this.speed*60/(Math.PI*2));
  this.caption(ctx,blur>.82?'满转！':this.pressing&&this.held>.28?'刹车中…':`${rpm} RPM`,CX,166,{size:13,color:blur>.82?BLUE_DEEP:INK});
  this.caption(ctx,this.record>0?`新纪录 ${this.best}`:`最高 ${this.best}`,CX,180-1,{size:9.5,weight:600,color:this.record>0?BLUE_DEEP:'#6a6a75'});
 }
}

// ── 打噪点 ─────────────────────────────────────────────────────────────────
// A 20-second whack-a-mole. Grey noise bugs +1, the golden 水印怪 +3, and the
// friendly blue square −2. Combos, a mallet swing and a saved best score.
const HOLES=Array.from({length:6},(_,i)=>({x:58+(i%3)*73,y:78+Math.floor(i/3)*52}));
const ROUND=20;
class WhackToy extends QingtuToy{
 constructor(){super();this.toyName='打噪点';this.state='ready';this.time=0;this.score=0;this.combo=0;this.best=remember('whackBest');
  this.moles=HOLES.map(()=>null);this.spawn=0;this.effects=[];this.mallet=null;this.peek=0;}
 idle(){const peek=()=>this.later(()=>{if(this.state!=='play'){this.peek=1;this.wake();}peek();},2600);peek();}
 start(){this.state='play';this.time=ROUND;this.score=0;this.combo=0;this.spawn=.4;this.moles=HOLES.map(()=>null);this.effects=[];}
 press(clientX,clientY){
  super.press(clientX,clientY);
  const {x,y}=this.local(clientX,clientY);
  this.mallet={x,y,t:1};
  if(this.state!=='play'){if(this.state==='ready'||this.endedAt&&performance.now()-this.endedAt>700)this.start();return;}
  const i=HOLES.findIndex(h=>Math.hypot(x-h.x,y-(h.y-10))<30);
  const mole=i>=0?this.moles[i]:null;
  if(mole&&!mole.hit&&mole.up>.35){
   mole.hit=true;mole.t=Math.min(mole.t,.25);
   const gain=mole.kind==='gold'?3:mole.kind==='friend'?-2:1;
   this.combo=gain>0?this.combo+1:0;
   const bonus=gain>0&&this.combo>=3?1:0;
   this.score=Math.max(0,this.score+gain+bonus);
   this.effects.push({x:HOLES[i].x,y:HOLES[i].y-34,text:gain<0?'别打我！':`+${gain+bonus}${bonus?' 连击':''}`,t:1,bad:gain<0,stars:gain>0});
  }else{this.combo=0;this.effects.push({x,y,text:'',t:.6,dust:true});}
 }
 step(dt){
  this.mallet&&(this.mallet.t-=dt/.22);if(this.mallet?.t<=0)this.mallet=null;
  this.peek=Math.max(0,this.peek-dt/1.2);
  for(const e of this.effects)e.t-=dt/.8;
  this.effects=this.effects.filter(e=>e.t>0);
  if(this.state==='play'){
   this.time-=dt;
   const pace=1-this.time/ROUND;
   this.spawn-=dt;
   if(this.spawn<=0){
    const free=HOLES.map((_,i)=>i).filter(i=>!this.moles[i]);
    if(free.length){const i=free[Math.floor(Math.random()*free.length)],r=Math.random();
     this.moles[i]={kind:r<.12?'gold':r<.24?'friend':'bug',t:0,life:rand(1.05,1.35)-pace*.45,up:0,hit:false};}
    this.spawn=rand(.42,.7)-pace*.18;
   }
   this.moles=this.moles.map(m=>{
    if(!m)return m;m.t+=dt;
    const rise=.16,fall=.16;m.up=m.hit?Math.max(0,1-(m.t-.25+.1)/.2):m.t<rise?m.t/rise:m.t>m.life-fall?Math.max(0,(m.life-m.t)/fall):1;
    return m.t>=(m.hit?.55:m.life)?null:m;
   });
   if(this.time<=0){this.state='over';this.endedAt=performance.now();this.moles=HOLES.map(()=>null);
    if(this.score>this.best){this.best=this.score;this.newBest=true;store('whackBest',this.best);}else this.newBest=false;}
  }
  return this.state==='play'||this.effects.length||this.mallet||this.peek>0;
 }
 bug(ctx,x,y,kind,hit){
  ctx.save();ctx.translate(x,y);if(hit)ctx.scale(1.15,.7);
  ctx.strokeStyle=INK;ctx.lineWidth=2.2;
  if(kind==='friend'){
   ctx.fillStyle=BLUE;ctx.beginPath();ctx.roundRect(-15,-15,30,30,8);ctx.fill();ctx.stroke();
   ctx.fillStyle=INK;ctx.beginPath();ctx.arc(-5,-3,2.4,0,Math.PI*2);ctx.arc(5,-3,2.4,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.arc(0,3,4,0,Math.PI);ctx.stroke();
  }else{
   const gold=kind==='gold';
   ctx.fillStyle=gold?'#ffcf3d':'#8d8d99';
   // Fuzzy outline: the bug is literally image noise.
   ctx.beginPath();for(let i=0;i<=14;i++){const a=i/14*Math.PI*2,r=15+(i%2?3:0);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();
   ctx.fillStyle=gold?'#fff4c2':'#c5c5cf';for(const [px,py] of [[-7,-8],[6,-9],[-9,5],[8,6],[0,9]])ctx.fillRect(px-1.5,py-1.5,3,3);
   ctx.fillStyle=PAPER;ctx.beginPath();ctx.arc(-5,-2,4.5,0,Math.PI*2);ctx.arc(5,-2,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.fillStyle=INK;
   if(hit){ctx.font='700 8px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('×',-5,-2);ctx.fillText('×',5,-2);}
   else{ctx.beginPath();ctx.arc(-4,-1.5,2,0,Math.PI*2);ctx.arc(6,-1.5,2,0,Math.PI*2);ctx.fill();}
   if(gold){ctx.fillStyle=INK;ctx.font='800 6px system-ui';ctx.textAlign='center';ctx.fillText('©',0,8);}
  }
  ctx.restore();
 }
 draw(ctx){
  // Board.
  ctx.fillStyle='rgba(255,255,255,.95)';ctx.strokeStyle=INK;ctx.lineWidth=2.5;
  ctx.beginPath();ctx.roundRect(14,24,234,140,18);ctx.fill();ctx.stroke();
  // Timer bar.
  const left=this.state==='play'?clamp(this.time/ROUND,0,1):this.state==='over'?0:1;
  ctx.fillStyle=MIST;ctx.beginPath();ctx.roundRect(30,34,202,6,3);ctx.fill();
  ctx.fillStyle=left<.25?'#ff6b6b':BLUE;ctx.beginPath();ctx.roundRect(30,34,202*left,6,3);ctx.fill();
  HOLES.forEach((h,i)=>{
   // Hole back, the mole clipped above the hole rim, then the rim front.
   ctx.fillStyle='#2a2a31';ctx.beginPath();ctx.ellipse(h.x,h.y,25,8,0,0,Math.PI*2);ctx.fill();
   const m=this.moles[i];
   const peek=this.state!=='play'&&i===1?Math.sin(this.peek*Math.PI)*.55:0;
   const up=m?m.up:peek;
   if(up>0){
    ctx.save();ctx.beginPath();ctx.rect(h.x-30,h.y-60,60,60);ctx.clip();
    this.bug(ctx,h.x,h.y+16-30*up,m?.kind||'bug',m?.hit);ctx.restore();
   }
   ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(h.x,h.y,25,8,0,0,Math.PI);ctx.stroke();
  });
  for(const e of this.effects){
   if(e.dust){ctx.strokeStyle=`rgba(80,80,90,${e.t})`;ctx.lineWidth=1.5;for(let k=0;k<5;k++){const a=k/5*Math.PI*2,d=6+(1-e.t)*12;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*d,e.y+Math.sin(a)*d,1.6,0,Math.PI*2);ctx.stroke();}continue;}
   if(e.stars){ctx.fillStyle=`rgba(255,207,61,${e.t})`;for(let k=0;k<4;k++){const a=k/4*Math.PI*2+(1-e.t)*3,d=14+(1-e.t)*10;ctx.beginPath();ctx.arc(e.x+Math.cos(a)*d,e.y+20+Math.sin(a)*d*.5,2.6,0,Math.PI*2);ctx.fill();}}
   this.caption(ctx,e.text,e.x,e.y-(1-e.t)*14,{size:12,alpha:Math.min(1,e.t*2),color:e.bad?'#e5484d':BLUE_DEEP});
  }
  // Mallet.
  if(this.mallet){
   const m=this.mallet,swing=(1-m.t)*1.1-.3;
   ctx.save();ctx.translate(m.x,m.y);ctx.rotate(-swing);
   ctx.strokeStyle=INK;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(6,-6);ctx.lineTo(28,-28);ctx.stroke();
   ctx.fillStyle=BLUE;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-10,-10,20,14,4);ctx.fill();ctx.stroke();
   ctx.restore();
  }
  // Status line.
  if(this.state==='play'){
   this.caption(ctx,`得分 ${this.score}`,64,176,{size:12});
   if(this.combo>=3)this.caption(ctx,`连击 ×${this.combo}`,131,176,{size:12,color:BLUE_DEEP});
   this.caption(ctx,`${Math.ceil(this.time)} 秒`,206,176,{size:12,color:this.time<5?'#e5484d':INK});
  }else if(this.state==='over'){
   ctx.fillStyle='rgba(255,255,255,.88)';ctx.beginPath();ctx.roundRect(40,72,182,58,12);ctx.fill();
   ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.stroke();
   this.caption(ctx,this.newBest?`新纪录 ${this.score} 分！`:`得分 ${this.score} · 最高 ${this.best}`,131,94,{size:16,color:this.newBest?BLUE_DEEP:INK});
   this.caption(ctx,'点一下再来一局',131,114,{size:11,weight:600,color:'#4a4a55'});
  }else{
   this.caption(ctx,'点一下开始 · 20 秒',131,176,{size:11.5,weight:600,color:'#4a4a55'});
   if(this.best)this.caption(ctx,`最高 ${this.best}`,214,14,{size:9.5,weight:600,color:'#6a6a75'});
  }
 }
}

export const TOY_ELEMENTS={squish:'qt-squish',bubbles:'qt-bubbles',shutter:'qt-shutter',munch:'qt-munch',spinner:'qt-spinner',whack:'qt-whack'};
for(const [tag,element] of [['qt-squish',SquishToy],['qt-bubbles',BubbleToy],['qt-shutter',ShutterToy],['qt-munch',MunchToy],['qt-spinner',SpinnerToy],['qt-whack',WhackToy]]){
 if(!customElements.get(tag))customElements.define(tag,element);
}
