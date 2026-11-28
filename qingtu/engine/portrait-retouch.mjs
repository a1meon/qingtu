const unit=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const x=unit(value);return x*x*(3-2*x);};
const within=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;

// Practical safety bounds for saved data only; no editing session reaches them.
export const maxLiquifyStrokes=5000;
export const maxLiquifyDabs=5000;
const fixed=value=>Math.round(value*1e5)/1e5;

export function extendLiquifyPath(path,last,point,radius,radiusY,kind,finish=false){
  const dx=point.x-last.x,dy=point.y-last.y;
  const distance=Math.hypot(dx/radius,dy/radiusY);
  const spacing=kind==='pinch'?.58:.12;
  const count=Math.min(maxLiquifyDabs-path.length,Math.floor(distance/spacing));
  const fraction=distance?Math.min(1,spacing/distance):0;
  for(let i=0;i<count;i++){
    const step=kind==='pinch'?i+1:i+.5;
    path.push({x:fixed(unit(last.x+dx*fraction*step)),y:fixed(unit(last.y+dy*fraction*step)),
      dx:fixed(kind==='pinch'?radius*.23:dx*fraction),dy:fixed(kind==='pinch'?0:dy*fraction),radius:fixed(radius),radiusY:fixed(radiusY)});
  }
  const consumed=fraction*count;
  if(finish&&kind==='push'&&path.length<maxLiquifyDabs&&(1-consumed)*distance>.035){
    const midpoint=(1+consumed)/2;
    path.push({x:fixed(unit(last.x+dx*midpoint)),y:fixed(unit(last.y+dy*midpoint)),dx:fixed(dx*(1-consumed)),dy:fixed(dy*(1-consumed)),radius:fixed(radius),radiusY:fixed(radiusY)});
    return point;
  }
  return {x:last.x+dx*consumed,y:last.y+dy*consumed};
}

export function portraitPoint({x,y},turn,mirrored=false){
  if(mirrored)x=1-x;
  if(turn===90)return {x:1-y,y:x};
  if(turn===180)return {x:1-x,y:1-y};
  if(turn===270)return {x:y,y:1-x};
  return {x,y};
}

// Same mapping as portraitPoint, written into a reusable object (hot loops).
function orient(x,y,turn,mirrored,out){
  if(mirrored)x=1-x;
  if(turn===90){out.x=1-y;out.y=x;}
  else if(turn===180){out.x=1-x;out.y=1-y;}
  else if(turn===270){out.x=y;out.y=1-x;}
  else{out.x=x;out.y=y;}
  return out;
}

export function normalizePortraitRetouch(value){
  if(value===undefined)return undefined;
  const invalid=()=>{throw new Error('美颜参数无效');};
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const {face,legs,head,slim=0,skin=0,faceSize=0,length=0,headSize=0,strokes=[],turn=0,mirrored=false}=value;
  if(![0,90,180,270].includes(turn)||typeof mirrored!=='boolean'||![slim,skin,faceSize,length,headSize].every(amount=>within(amount,0,100))||
     !Array.isArray(strokes)||strokes.length>maxLiquifyStrokes)invalid();
  const box=region=>{
    if(!region||!within(region.x,0,1)||!within(region.y,0,1)||!within(region.rx,.005,.75)||!within(region.ry,.005,.75))invalid();
    const oval=Array.isArray(region.oval)&&region.oval.length>=12&&region.oval.length<=64&&
      region.oval.every(point=>within(point?.x,-.25,1.25)&&within(point?.y,-.25,1.25))?region.oval.map(({x,y})=>({x,y})):undefined;
    const lean=within(region.lean,-1,1)?region.lean:undefined;
    return {x:region.x,y:region.y,rx:region.rx,ry:region.ry,...(oval&&{oval}),...(lean!==undefined&&{lean})};
  };
  if(length&&(!legs||!within(legs.hip,0,1)||!within(legs.ankle,legs.hip+.025,1)||
     !within(legs.x,0,1)||!within(legs.radius,.05,1)||
     legs.foot!==undefined&&!within(legs.foot,legs.ankle,1)||
     legs.bottom!==undefined&&!within(legs.bottom,legs.ankle,1)||
     legs.lock!==undefined&&!within(legs.lock,legs.hip+.012,legs.ankle)||
     legs.core!==undefined&&!within(legs.core,0,legs.radius)))invalid();
  const dab=point=>{
    if(!point||!within(point.x,0,1)||!within(point.y,0,1)||
       !within(point.dx,-.2,.2)||!within(point.dy,-.2,.2)||!within(point.radius,.0007,.4)||
       point.radiusY!==undefined&&!within(point.radiusY,.0007,.4))invalid();
    const {x,y,dx,dy,radius,radiusY}=point;
    return {x,y,dx,dy,radius,...(radiusY!==undefined&&{radiusY})};
  };
  const brushes=strokes.map(stroke=>{
    if(!['push','pinch'].includes(stroke?.kind))invalid();
    if(stroke.path===undefined)return {...dab(stroke),kind:stroke.kind};
    if(!Array.isArray(stroke.path)||!stroke.path.length||stroke.path.length>maxLiquifyDabs)invalid();
    return {kind:stroke.kind,path:stroke.path.map(dab),...(stroke.soft===true&&stroke.kind==='push'&&{soft:true})};
  });
  if(!slim&&!skin&&!faceSize&&!length&&!headSize&&!brushes.length)return undefined;
  return {turn,...(mirrored&&{mirrored}),...(slim||skin||faceSize?{face:box(face),slim,skin,...(faceSize&&{faceSize})}:{}),
    ...(headSize?{head:box(head),headSize}:{}),
    ...(length?{legs:{hip:legs.hip,ankle:legs.ankle,x:legs.x,radius:legs.radius,
      ...(legs.foot!==undefined&&{foot:legs.foot}),...(legs.bottom!==undefined&&{bottom:legs.bottom}),
      ...(legs.lock!==undefined&&{lock:legs.lock}),...(legs.core!==undefined&&{core:legs.core})},length}:{}),
    ...(brushes.length?{strokes:brushes}:{})};
}

export function hasPortraitRetouch(value){
  return !!(value?.slim||value?.skin||value?.faceSize||value?.length||value?.headSize||value?.strokes?.length);
}

// Adapts a retouch to the layer's current crop. The raster being warped is the
// whole (uncropped) image, so the visible crop window is passed as a clip:
// geometry never samples beyond it and cropped-away pixels never slide in.
export function portraitForCrop(retouch,crop){
  if(!retouch)return retouch;
  const {left=0,top=0,right=0,bottom=0}=crop||{};
  let next=retouch;
  if(left>0||top>0||right>0||bottom>0)next={...next,clip:{left,top,right:1-right,bottom:1-bottom}};
  if(!retouch.length)return next;
  const {turn=0,legs}=retouch;
  const edge=1-(turn===90?left:turn===180?top:turn===270?right:bottom);
  return {...next,legs:{...legs,bottom:edge}};
}

function stretchProfile(legs,amount,visibleBottom){
  if(!amount)return;
  const {hip,ankle}=legs,span=ankle-hip;
  const bottom=Math.min(visibleBottom,legs.bottom??1);
  const shoeTop=legs.lock??Math.max(hip+.012,ankle-Math.min(.025,span*.14));
  const toe=Math.max(legs.foot??ankle+Math.min(.04,span*.12),ankle+.013);
  // Leave enough space for the whole shoe, including the sole beyond the pose landmark.
  const sole=toe+Math.min(.055,Math.max(.012,(toe-ankle)*.52));
  const offset=Math.min((shoeTop-hip)*.23,(bottom-sole)*.8)*amount/100;
  if(offset<=0)return;
  return {hip,offset,shoeTop:shoeTop+offset,core:Math.max(legs.core||0,legs.radius*.78)};
}

export function hasLimitedLegRoom(legs){
  return legs&&(stretchProfile(legs,100,1)?.offset||0)<.018;
}

function brushCells(dabs,size=24){
  const cells=Array.from({length:size*size},()=>[]);
  const cell=value=>Math.min(size-1,Math.max(0,Math.floor(value*size)));
  for(const dab of dabs){
    const {x,y,radius,radiusY}=dab;
    const guard=dab.soft?2:1.65;
    const minX=cell(x-radius*guard),maxX=cell(x+radius*guard);
    const minY=cell(y-radiusY*guard),maxY=cell(y+radiusY*guard);
    for(let row=minY;row<=maxY;row++)for(let col=minX;col<=maxX;col++)cells[row*size+col].push(dab);
  }
  return (x,y)=>cells[cell(y)*size+cell(x)];
}

function makeBrushOffset(cell,aspect){
  return (x,y,out)=>{
    const nearby=cell(x,y);
    let group=-1,totalX=0,totalY=0,weightSum=0,radius=0;
    function applySoft(){
      if(!weightSum)return;
      const limit=Math.max(1,Math.hypot(totalX,totalY/aspect)/(radius*.48));
      const resistance=1+Math.max(0,weightSum-1)*.28;
      x-=totalX/(limit*resistance);y-=totalY/(limit*resistance);
      totalX=totalY=weightSum=radius=0;
    }
    for(let i=nearby.length-1;i>=0;i--){
      const dab=nearby[i];
      if(dab.group!==group){applySoft();group=dab.group;}
      const dx=x-dab.x,dy=y-dab.y;
      const spread=dab.soft?1.48:1;
      const distance=(dx/dab.radius)**2+(dy/dab.radiusY)**2;
      if(distance>=spread*spread)continue;
      const weight=(1-distance/(spread*spread))**3;
      if(dab.soft){
        totalX+=dab.dx*weight;totalY+=dab.dy*weight;weightSum+=weight;radius=Math.max(radius,dab.radius);
      }else if(dab.kind==='push'){
        const legacyWeight=(1-distance)**2;x-=dab.dx*legacyWeight;y-=dab.dy*legacyWeight;
      }else{
        const gain=Math.min(.55,Math.hypot(dab.dx/dab.radius,dab.dy/dab.radiusY))*(1-distance)**2;
        x+=dx*gain;y+=dy*gain;
      }
    }
    applySoft();
    out[0]=x;out[1]=y;
  };
}


// Forward warp (the model used by professional liquify tools). The field is an
// inverse map: a destination point p samples the source at p + D(p). Pushing by
// v with weight w composes as D'(p) = -w·v + D(p - w·v), so every dab builds on
// the warp so far and content follows the brush smoothly instead of tearing.
// The grid covers the whole frame so dabs can be added incrementally while a
// stroke is being drawn (see createLiquifyPreview).
const FIELD_CELLS=420;
// Liquify brush profile: a broad plateau with a soft shoulder, close to the
// pressure falloff of professional forward-warp brushes.
const brushWeight=t=>{const q=1-t;return q*q*(1+t*.6);};
export class LiquifyField{
  constructor(aspect,{left=0,top=0,right=1,bottom=1}={}){
    const spanX=Math.max(.05,right-left);
    this.cx=Math.min(1/FIELD_CELLS,spanX/FIELD_CELLS);this.cy=this.cx*aspect;
    this.x0=left-this.cx*2;this.y0=top-this.cy*2;
    this.cols=Math.ceil((right-left)/this.cx)+5;this.rows=Math.ceil((bottom-top)/this.cy)+5;
    this.field=new Float32Array(this.cols*this.rows*2);this.snapshot=new Float32Array(this.cols*this.rows*2);
    this.bounds=null;this.tmp=[0,0];
  }
  read(grid,gx,gy,out){
    const {cols,rows}=this;
    if(gx<0||gy<0||gx>cols-1||gy>rows-1){out[0]=0;out[1]=0;return;}
    const c=Math.min(cols-2,Math.floor(gx)),r=Math.min(rows-2,Math.floor(gy)),a=gx-c,b=gy-r;
    const i=(r*cols+c)*2,j=i+cols*2;
    out[0]=(grid[i]*(1-a)+grid[i+2]*a)*(1-b)+(grid[j]*(1-a)+grid[j+2]*a)*b;
    out[1]=(grid[i+1]*(1-a)+grid[i+3]*a)*(1-b)+(grid[j+1]*(1-a)+grid[j+3]*a)*b;
  }
  // Adds dabs and returns the region they changed ([x0,y0,x1,y1]) or null.
  add(dabs){
    const {cx,cy,x0,y0,cols,rows,field,snapshot,tmp}=this;
    let dirty=null;
    for(const d of dabs){
      const strength=d.strength??.65;
      const c0=Math.max(0,Math.floor((d.x-d.radius-x0)/cx)),c1=Math.min(cols-1,Math.ceil((d.x+d.radius-x0)/cx));
      const r0=Math.max(0,Math.floor((d.y-d.radiusY-y0)/cy)),r1=Math.min(rows-1,Math.ceil((d.y+d.radiusY-y0)/cy));
      if(c0>c1||r0>r1)continue;
      const margin=Math.ceil(Math.abs(d.dy)*strength/cy)+2;
      const s0=Math.max(0,r0-margin)*cols*2,s1=(Math.min(rows-1,r1+margin)+1)*cols*2;
      snapshot.set(field.subarray(s0,s1),s0);
      for(let r=r0;r<=r1;r++){
        const py=y0+r*cy,ty=((py-d.y)/d.radiusY)**2;
        if(ty>=1)continue;
        for(let c=c0;c<=c1;c++){
          const px=x0+c*cx,t=((px-d.x)/d.radius)**2+ty;
          if(t>=1)continue;
          const w=strength*brushWeight(t),vx=d.dx*w,vy=d.dy*w;
          this.read(snapshot,(px-vx-x0)/cx,(py-vy-y0)/cy,tmp);
          const i=(r*cols+c)*2;field[i]=tmp[0]-vx;field[i+1]=tmp[1]-vy;
        }
      }
      const box=[d.x-d.radius,d.y-d.radiusY,d.x+d.radius,d.y+d.radiusY];
      dirty=dirty?[Math.min(dirty[0],box[0]),Math.min(dirty[1],box[1]),Math.max(dirty[2],box[2]),Math.max(dirty[3],box[3])]:box;
    }
    if(dirty){
      dirty=[dirty[0]-cx*2,dirty[1]-cy*2,dirty[2]+cx*2,dirty[3]+cy*2];
      const b=this.bounds;
      this.bounds=b?[Math.min(b[0],dirty[0]),Math.min(b[1],dirty[1]),Math.max(b[2],dirty[2]),Math.max(b[3],dirty[3])]:dirty;
    }
    return dirty;
  }
  at(x,y,out){this.read(this.field,(x-this.x0)/this.cx,(y-this.y0)/this.cy,out);}
}

function frameGeometry(retouch,{width,height,crop}){
  const {turn=0,mirrored=false}=retouch;
  const {left=0,top=0,right=1,bottom=1}=crop||{},spanX=right-left,spanY=bottom-top;
  const inverse=mirrored?turn:(360-turn)%360;
  const aspect=(turn%180?height/width*spanX/spanY:width/height*spanY/spanX);
  // Clip window (visible crop) in the same coordinates as left/top/right/bottom.
  const clip=retouch.clip;
  let cl=Math.max(left,clip?.left??left),ct=Math.max(top,clip?.top??top);
  let cr=Math.min(right,clip?.right??right),cb=Math.min(bottom,clip?.bottom??bottom);
  if(!(cr>cl&&cb>ct)){cl=left;ct=top;cr=right;cb=bottom;}
  // Visible frame in source orientation.
  const a=portraitPoint({x:cl,y:ct},inverse,mirrored),b=portraitPoint({x:cr,y:cb},inverse,mirrored);
  const sourceFrame={left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)};
  return {turn,mirrored,left,top,right,bottom,spanX,spanY,inverse,aspect,sourceFrame,width,height,
    clipLeft:cl,clipTop:ct,clipRight:cr,clipBottom:cb};
}

// Destination pixel range covered by source-orientation boxes.
function pixelBounds(boxes,g){
  const {turn,mirrored,left,top,spanX,spanY,width,height}=g;
  const corners=boxes.flatMap(([x0,y0,x1,y1])=>[portraitPoint({x:x0,y:y0},turn,mirrored),portraitPoint({x:x1,y:y1},turn,mirrored)]);
  if(!corners.length)return null;
  const startX=Math.floor(unit((Math.min(...corners.map(p=>p.x))-left)/spanX)*width);
  const endX=Math.ceil(unit((Math.max(...corners.map(p=>p.x))-left)/spanX)*width);
  const startY=Math.floor(unit((Math.min(...corners.map(p=>p.y))-top)/spanY)*height);
  const endY=Math.ceil(unit((Math.max(...corners.map(p=>p.y))-top)/spanY)*height);
  return startX<endX&&startY<endY?{startX,endX,startY,endY}:null;
}

// Bilinear RGBA sampler. Opaque neighbourhoods (almost every pixel) take a
// plain path; partly transparent ones are premultiplied so edges stay clean.
function makeSampler(source,pixels,g){
  const {width,height,left,top,spanX,spanY}=g;
  const kx=width/spanX,ky=height/spanY,maxX=width-1,maxY=height-1,stride=width*4;
  return (x,y,index)=>{
    let fx=(x-left)*kx-.5,fy=(y-top)*ky-.5;
    fx=fx<0?0:fx>maxX?maxX:fx;fy=fy<0?0:fy>maxY?maxY:fy;
    const col=fx|0,row=fy|0,a=fx-col,b=fy-row;
    const i=(row*width+col)*4,dx=col<maxX?4:0,dy=row<maxY?stride:0;
    const i1=i+dx,i2=i+dy,i3=i2+dx;
    const w0=(1-a)*(1-b),w1=a*(1-b),w2=(1-a)*b,w3=a*b;
    const a0=source[i+3],a1=source[i1+3],a2=source[i2+3],a3=source[i3+3];
    if((a0&a1&a2&a3)===255){
      pixels[index]=source[i]*w0+source[i1]*w1+source[i2]*w2+source[i3]*w3;
      pixels[index+1]=source[i+1]*w0+source[i1+1]*w1+source[i2+1]*w2+source[i3+1]*w3;
      pixels[index+2]=source[i+2]*w0+source[i1+2]*w1+source[i2+2]*w2+source[i3+2]*w3;
      pixels[index+3]=255;
      return;
    }
    const alpha=a0*w0+a1*w1+a2*w2+a3*w3;
    pixels[index+3]=alpha;
    if(!alpha)return;
    for(let c=0;c<3;c++){
      pixels[index+c]=(source[i+c]*a0*w0+source[i1+c]*a1*w1+source[i2+c]*a2*w2+source[i3+c]*a3*w3)/alpha;
    }
  };
}

// Never sample beyond the visible frame: an offset may cover at most half the
// distance to the edge it points at, so edges compress instead of smearing.
function clampToFrame(point,tx,ty,g){
  const {clipLeft:left,clipTop:top,clipRight:right,clipBottom:bottom}=g;
  if(tx<left||tx>right||ty<top||ty>bottom)return point;
  const ox=point.x-tx,oy=point.y-ty;
  point.x=tx+(ox<0?Math.max(ox,-(tx-left)*.5):Math.min(ox,(right-tx)*.5));
  point.y=ty+(oy<0?Math.max(oy,-(ty-top)*.5):Math.min(oy,(bottom-ty)*.5));
  return point;
}

function resampleField(field,source,pixels,g,region){
  const bounds=pixelBounds([region],g);
  if(!bounds)return;
  const sample=makeSampler(source,pixels,g),d=[0,0],o={x:0,y:0},point={x:0,y:0};
  const {turn,mirrored,inverse,left,top,spanX,spanY,width,height}=g;
  for(let py=bounds.startY;py<bounds.endY;py++)for(let px=bounds.startX;px<bounds.endX;px++){
    const tx=left+(px+.5)/width*spanX,ty=top+(py+.5)/height*spanY;
    orient(tx,ty,inverse,mirrored,o);
    field.at(o.x,o.y,d);
    const i=(py*width+px)*4;
    if(!d[0]&&!d[1]){pixels[i]=source[i];pixels[i+1]=source[i+1];pixels[i+2]=source[i+2];pixels[i+3]=source[i+3];continue;}
    clampToFrame(orient(o.x+d[0],o.y+d[1],turn,mirrored,point),tx,ty,g);
    sample(point.x,point.y,i);
  }
}

// Interactive liquify: keeps the field of the stroke being drawn and only
// applies and resamples the newly added dabs, so each frame costs the size of
// the brush instead of the whole stroke.
export function createLiquifyPreview(base,{turn=0,mirrored=false}={},frame){
  const g=frameGeometry({turn,mirrored},frame);
  const field=new LiquifyField(g.aspect,g.sourceFrame);
  const output=base.slice();
  let count=0,last=null;
  return {
    output,
    extend(path){
      if(path.length<count||count&&(path[count-1].x!==last.x||path[count-1].y!==last.y||path[count-1].radius!==last.radius))return false;
      const added=path.slice(count).map(dab=>({...dab,radiusY:dab.radiusY??dab.radius*g.aspect}));
      count=path.length;last=path[count-1];
      const dirty=field.add(added);
      if(dirty)resampleField(field,base,output,g,dirty);
      return true;
    },
  };
}

// Edge-preserving skin smoothing (fast guided filter guided by luminance).
// Smooth skin tone and blotches at the face's scale, then add back a share of
// the finest texture (pores) so the result never looks plastic. Only skin
// tones inside the face fade are affected.
function boxFilter(src,w,h,r,out,tmp){
  for(let y=0;y<h;y++){
    const row=y*w;let sum=0;
    for(let x=-r;x<=r;x++)sum+=src[row+Math.max(0,Math.min(w-1,x))];
    for(let x=0;x<w;x++){
      tmp[row+x]=sum/(2*r+1);
      sum+=src[row+Math.min(w-1,x+r+1)]-src[row+Math.max(0,x-r)];
    }
  }
  for(let x=0;x<w;x++){
    let sum=0;
    for(let y=-r;y<=r;y++)sum+=tmp[Math.max(0,Math.min(h-1,y))*w+x];
    for(let y=0;y<h;y++){
      out[y*w+x]=sum/(2*r+1);
      sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];
    }
  }
  return out;
}

function smoothSkin(pixels,face,amount,g){
  const {turn,mirrored,inverse,left,top,spanX,spanY,width,height}=g;
  const bounds=pixelBounds([[face.x-face.rx*1.2,face.y-face.ry*1.15,face.x+face.rx*1.2,face.y+face.ry*1.15]],g);
  if(!bounds)return;
  const {startX,endX,startY,endY}=bounds,w=endX-startX,h=endY-startY;
  const facePx=2*face.rx*(turn%180?height/spanY:width/spanX);
  // Work at a bounded resolution: the filter only carries smooth coefficients.
  const s=Math.max(1,Math.ceil(Math.max(w,h)/640)),lw=Math.ceil(w/s),lh=Math.ceil(h/s),n=lw*lh;
  const I=new Float32Array(n),P=[new Float32Array(n),new Float32Array(n),new Float32Array(n)];
  const counts=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((startY+y)*width+startX+x)*4,j=Math.floor(y/s)*lw+Math.floor(x/s);
    const r=pixels[i],gg=pixels[i+1],b=pixels[i+2];
    I[j]+=.299*r+.587*gg+.114*b;P[0][j]+=r;P[1][j]+=gg;P[2][j]+=b;counts[j]++;
  }
  for(let j=0;j<n;j++){const c=counts[j]||1;I[j]/=c;P[0][j]/=c;P[1][j]/=c;P[2][j]/=c;}
  const radius=Math.max(1,Math.round(facePx*.022/s)),eps=(8+10*amount)**2;
  const tmp=new Float32Array(n),meanI=boxFilter(I,lw,lh,radius,new Float32Array(n),tmp);
  const sq=new Float32Array(n);for(let j=0;j<n;j++)sq[j]=I[j]*I[j];
  const varI=boxFilter(sq,lw,lh,radius,new Float32Array(n),tmp);
  for(let j=0;j<n;j++)varI[j]-=meanI[j]*meanI[j];
  const A=[],B=[];
  for(let c=0;c<3;c++){
    const p=P[c],ip=new Float32Array(n);for(let j=0;j<n;j++)ip[j]=I[j]*p[j];
    const meanP=boxFilter(p,lw,lh,radius,new Float32Array(n),tmp),corr=boxFilter(ip,lw,lh,radius,new Float32Array(n),tmp);
    const a=new Float32Array(n),b=new Float32Array(n);
    for(let j=0;j<n;j++){a[j]=(corr[j]-meanI[j]*meanP[j])/(varI[j]+eps);b[j]=meanP[j]-a[j]*meanI[j];}
    A.push(boxFilter(a,lw,lh,radius,new Float32Array(n),tmp));B.push(boxFilter(b,lw,lh,radius,new Float32Array(n),tmp));
  }
  // Monochrome faces (black-and-white photos) skip the skin-tone test.
  let chroma=0;for(let j=0;j<n;j+=7)chroma+=Math.abs(P[2][j]-I[j])+Math.abs(P[0][j]-I[j]);
  const monochrome=chroma/Math.ceil(n/7)<8;
  const fine=Math.max(1,Math.round(facePx/260)),keep=.38-.18*amount;
  const source=pixels.slice((startY*width)*4,(endY*width)*4),offset=startY*width*4;
  const o={x:0,y:0},[A0,A1,A2]=A,[B0,B1,B2]=B,stride=width*4;
  const gain=Math.min(1,amount*1.15),dx=lw>1?1:0,dy=lh>1?lw:0;
  // Bilinear positions of each column in the coefficient maps.
  const cols=new Int32Array(w),colA=new Float32Array(w);
  for(let x=0;x<w;x++){const gx=Math.max(0,Math.min(lw-1,(x+.5)/s-.5)),c0=Math.max(0,Math.min(lw-2,Math.floor(gx)));cols[x]=c0;colA[x]=lw>1?gx-c0:0;}
  for(let y=0;y<h;y++){
    const gy=Math.max(0,Math.min(lh-1,(y+.5)/s-.5)),r0=Math.max(0,Math.min(lh-2,Math.floor(gy))),bY=lh>1?gy-r0:0;
    const py=startY+y,ty=top+(py+.5)/height*spanY,rowBase=r0*lw;
    for(let x=0;x<w;x++){
      const px=startX+x,i=(py*width+px)*4;
      if(pixels[i+3]!==255)continue;
      orient(left+(px+.5)/width*spanX,ty,inverse,mirrored,o);
      const nx=(o.x-face.x)/face.rx,ny=(o.y-face.y)/face.ry;
      const f=1.45-nx*nx/.9025-ny*ny/1.1025;
      if(f<=0)continue;
      const fade=f>=1?1:f*f*(3-2*f);
      const aX=colA[x],k=rowBase+cols[x];
      const w00=(1-aX)*(1-bY),w10=aX*(1-bY),w01=(1-aX)*bY,w11=aX*bY;
      const k1=k+dx,k2=k+dy,k3=k2+dx;
      const j=i-offset,r=source[j],gg=source[j+1],bb=source[j+2];
      const Y=.299*r+.587*gg+.114*bb;
      const q0=(A0[k]*w00+A0[k1]*w10+A0[k2]*w01+A0[k3]*w11)*Y+B0[k]*w00+B0[k1]*w10+B0[k2]*w01+B0[k3]*w11;
      const q1=(A1[k]*w00+A1[k1]*w10+A1[k2]*w01+A1[k3]*w11)*Y+B1[k]*w00+B1[k1]*w10+B1[k2]*w01+B1[k3]*w11;
      const q2=(A2[k]*w00+A2[k1]*w10+A2[k2]*w01+A2[k3]*w11)*Y+B2[k]*w00+B2[k1]*w10+B2[k2]*w01+B2[k3]*w11;
      let tone=1;
      if(!monochrome){
        const cb=(128-.1687*q0-.3313*q1+.5*q2-112)/22,cr=(128+.5*q0-.4187*q1-.0813*q2-150)/20;
        const t=1.5-Math.sqrt(cb*cb+cr*cr);
        if(t<=0)continue;
        tone=t>=1?1:t*t*(3-2*t);
      }
      // Strong local contrast (eyes, brows, lips, nostrils) is left alone.
      const e=(Math.abs(Y-(.299*q0+.587*q1+.114*q2))-10)/26;
      const edge=e<=0?1:e>=1?0:1-e*e*(3-2*e);
      const mix=fade*tone*edge*gain;
      if(mix<=.002)continue;
      // Finest texture: the pixel minus its small neighbourhood mean.
      const l=j-Math.min(fine,x)*4,rt=j+Math.min(fine,w-1-x)*4;
      const u=j-Math.min(fine,y)*stride,d=j+Math.min(fine,h-1-y)*stride;
      pixels[i]=r+(q0+keep*(r-(source[l]+source[rt]+source[u]+source[d]+r*4)/8)-r)*mix;
      pixels[i+1]=gg+(q1+keep*(gg-(source[l+1]+source[rt+1]+source[u+1]+source[d+1]+gg*4)/8)-gg)*mix;
      pixels[i+2]=bb+(q2+keep*(bb-(source[l+2]+source[rt+2]+source[u+2]+source[d+2]+bb*4)/8)-bb)*mix;
    }
  }
}

// How a face is turned: lean is the nose offset from the face-box centre in
// face half-widths (0 frontal, about ±0.5 three-quarter, ±1 profile). The
// face's midline follows the nose; the near cheek is wider, the far cheek is
// foreshortened.
function faceSides(face){
  const lean=Math.max(-1,Math.min(1,face.lean||0)),turned=Math.abs(lean);
  const axis=face.x+lean*face.rx*.7;
  return {lean,turned,axis,
    // Half-width and slimming gain on each side of the midline. The far cheek
    // eases off as the face turns, and on a profile only the near side moves,
    // so the nose and the far contour are never pushed in.
    side(x){
      const far=lean&&Math.sign(x-axis)===Math.sign(lean);
      const width=face.rx*(far?1-turned*.7:1+turned*.7);
      return {width:Math.max(face.rx*.15,width),gain:far?Math.max(0,1-turned*1.8):1+turned*.25};
    },
  };
}

// Contour slimming from the detected face oval: each cheek and jaw point is
// pushed toward the face's midline in small forward-warp steps, so the real
// jawline moves (turned or tilted faces included) while the forehead, eyes
// and chin centre stay put. Frontal faces slim both sides evenly; turned faces
// slim mostly the near side.
function slimDabs(face,amount,aspect){
  if(!face?.oval?.length||!amount)return [];
  const steps=6,radius=face.rx*.46,radiusY=radius*aspect,dabs=[],sides=faceSides(face);
  for(const point of face.oval){
    const {width,gain}=sides.side(point.x);
    if(!gain)continue;
    const lower=smooth((point.y-(face.y-face.ry*.25))/(face.ry*.85));
    const side=smooth((Math.abs(point.x-sides.axis)/width-.2)/.45);
    const shift=(sides.axis-point.x)*.22*amount/100*lower*side*gain;
    if(Math.abs(shift)<1e-5)continue;
    for(let i=0;i<steps;i++)dabs.push({x:point.x+shift*i/steps,y:point.y,dx:shift/steps,dy:0,radius,radiusY,strength:1});
  }
  return dabs;
}

// Small head: a uniform scale (same in x and y, so the head never looks
// squashed) about an anchor just above the chin, so the head stays attached
// to the neck. The whole head box, hair included, scales as one piece and the
// change fades out around it. The whole effect, fade included, is fitted
// inside the visible frame with a margin: on close-ups, where the head fills
// the frame, the uniform zone shrinks and the strength is capped so the frame
// edges never move. Each fade stays wide enough for the mapping to remain
// monotonic (no folds).
// Uniform scale about an anchor inside a rounded box, fading out on each side
// and fitted inside the visible frame (with a margin) so the frame edges never
// move. Each fade stays wide enough for the mapping to remain monotonic.
function scaleWarp({ax,ay,left:boxLeft,right:boxRight,top:boxTop,bottom:boxBottom,fadeX,fadeTop,fadeBottom,strength},frame){
  const {left,top,right,bottom}=frame;
  const margin=Math.min(right-left,bottom-top)*.04;
  let a=strength;
  // Per side: [inner extent from the anchor, desired fade, room to the frame edge].
  const fit=(inner,fade,room)=>{
    room=Math.max(1e-4,room-margin);
    if(inner+fade>room){inner=Math.min(inner,room*.42);fade=room-inner;}
    inner=Math.max(0,inner);fade=Math.max(1e-4,fade);
    a=Math.min(a,.4*fade/(inner+fade));
    return [inner,fade];
  };
  const [eL,fL]=fit(ax-boxLeft,fadeX,ax-left);
  const [eR,fR]=fit(boxRight-ax,fadeX,right-ax);
  const [eT,fT]=fit(ay-boxTop,fadeTop,ay-top);
  const [eB,fB]=fit(Math.max(0,boxBottom-ay),fadeBottom,bottom-ay);
  return {
    bounds:[ax-eL-fL,ay-eT-fT,ax+eR+fR,ay+eB+fB],
    apply(x,y,out){
      const dx=x-ax,dy=y-ay;
      const ex=dx<0?Math.max(0,-dx-eL)/fL:Math.max(0,dx-eR)/fR;
      const ey=dy<0?Math.max(0,-dy-eT)/fT:Math.max(0,dy-eB)/fB;
      const e=ex||ey?Math.sqrt(ex*ex+ey*ey):0;
      if(e>=1)return false;
      const k=a*(1-smooth(e));
      out.x=x+dx*k;out.y=y+dy*k;
      return true;
    },
  };
}

// 美体 small head: the whole head box (hair included) for full and half-length
// figures. A cut-off crown (close-up) moves the anchor up toward the centre.
function headWarp(head,headSize,frame){
  const closeUp=head.y-head.ry<frame.top+.03;
  const margin=Math.min(frame.right-frame.left,frame.bottom-frame.top)*.04;
  const rx=head.rx*1.12;
  return scaleWarp({ax:head.x,ay:Math.min(head.y+head.ry*(closeUp?.25:.55),frame.bottom-margin*2),
    left:head.x-rx,right:head.x+rx,top:head.y-head.ry*1.08,bottom:head.y+head.ry,
    fadeX:Math.max(head.rx*.55,rx*.36),fadeTop:head.ry*.6,fadeBottom:head.ry*.5,strength:headSize/100*.15},frame);
}

// 美颜 small head: driven by the face landmarks, for portraits and close-ups.
// The face, forehead and hairline shrink together about a point between the
// mouth and the chin, so the jaw stays on the neck. The fades are sized to
// the face, so shoulders, background edges and the frame stay put; the
// strength is gentler than the full-figure version.
function faceHeadWarp(face,amount,frame){
  const margin=Math.min(frame.right-frame.left,frame.bottom-frame.top)*.04;
  const rx=face.rx*1.18;
  return scaleWarp({ax:face.x,ay:Math.min(face.y+face.ry*.5,frame.bottom-margin*2),
    left:face.x-rx,right:face.x+rx,top:face.y-face.ry*1.5,bottom:face.y+face.ry,
    fadeX:face.rx*.75,fadeTop:face.ry*.75,fadeBottom:face.ry*.45,strength:amount/100*.12},frame);
}

// For the raster, convert each affected destination pixel to a source
// coordinate. Sample RGBA together so transparent edges stay transparent.
export function applyPortraitRetouch(pixels,retouch,frame){
  const {width,height}=frame;
  if(!hasPortraitRetouch(retouch)||width*height*4!==pixels.length)return pixels;
  const {face,legs,head,slim=0,skin=0,faceSize=0,length=0,headSize=0,strokes=[]}=retouch;
  const g=frameGeometry(retouch,frame);
  const {turn,mirrored,inverse,left,top,spanX,spanY,aspect}=g;
  const visibleBottom=turn===90?1-left:turn===180?1-top:turn===270?g.right:g.bottom;
  const profile=stretchProfile(legs,length,visibleBottom);
  const dabs=strokes.flatMap((stroke,group)=>(stroke.path||[stroke]).map(dab=>({
    ...dab,kind:stroke.kind,soft:stroke.soft,group,radiusY:dab.radiusY??dab.radius*aspect,
  })));
  // Smooth pushes (all current strokes) use the forward-warp field; legacy
  // hard pushes and pinches saved by older versions keep their original model.
  const legacy=dabs.filter(dab=>!(dab.soft&&dab.kind==='push'));
  const contour=face&&slim?slimDabs(face,slim,aspect):[];
  const warpDabs=[...dabs.filter(dab=>dab.soft&&dab.kind==='push'),...contour];
  let field=null;
  if(warpDabs.length){field=new LiquifyField(aspect,g.sourceFrame);field.add(warpDabs);}
  const brush=legacy.length?makeBrushOffset(brushCells(legacy),aspect):null;
  const headShape=headSize&&head?headWarp(head,headSize,g.sourceFrame):null;
  const faceShape=faceSize&&face?faceHeadWarp(face,faceSize,g.sourceFrame):null;
  const analyticSlim=face&&slim&&!face.oval,faceTurn=analyticSlim?faceSides(face):null;
  const boxes=[];
  if(analyticSlim)boxes.push([face.x-face.rx*1.65,face.y-face.ry*1.48,face.x+face.rx*1.65,face.y+face.ry*1.48]);
  if(headShape)boxes.push(headShape.bounds);
  if(faceShape)boxes.push(faceShape.bounds);
  if(profile)boxes.push([0,profile.hip,1,1]);
  if(field?.bounds)boxes.push(field.bounds);
  legacy.forEach(({x,y,radius,radiusY})=>boxes.push([x-radius*1.5,y-radiusY*1.5,x+radius*1.5,y+radiusY*1.5]));
  const bounds=pixelBounds(boxes,g);
  if(bounds){
    const source=new Uint8ClampedArray(pixels);
    const sample=makeSampler(source,pixels,g),displacement=[0,0],original={x:0,y:0},point={x:0,y:0};
    for(let py=bounds.startY;py<bounds.endY;py++)for(let px=bounds.startX;px<bounds.endX;px++){
      const tx=left+(px+.5)/width*spanX,ty=top+(py+.5)/height*spanY;
      orient(tx,ty,inverse,mirrored,original);
      let x=original.x,y=original.y;
      if(field){field.at(x,y,displacement);x+=displacement[0];y+=displacement[1];}
      if(brush){brush(x,y,displacement);x=displacement[0];y=displacement[1];}
      if(profile&&y>profile.hip){
        // The whole width stretches together, so the background only lengthens
        // evenly and its horizontal lines stay straight. The stretch ends at the
        // shoe opening; everything lower moves down as one piece.
        y-=profile.offset*smooth((y-profile.hip)/(profile.shoeTop-profile.hip));
      }
      if(headShape&&headShape.apply(x,y,point)){x=point.x;y=point.y;}
      if(faceShape&&faceShape.apply(x,y,point)){x=point.x;y=point.y;}
      if(analyticSlim){
        // Fallback without a detected contour: pull in the cheek and jaw only.
        const {width,gain}=faceTurn.side(x);
        const nx=(x-faceTurn.axis)/width,ny=(y-face.y)/face.ry;
        const sides=smooth((Math.abs(nx)-.38)/.62),falloff=smooth(1.5-(nx/1.45)**2-(ny/1.3)**2);
        const shape=.22+.78*smooth((ny+.25)/.95);
        x+=(x-faceTurn.axis)*(.34*slim/100)*sides*falloff*shape*gain;
      }
      if(x===original.x&&y===original.y)continue;
      clampToFrame(orient(x,y,turn,mirrored,point),tx,ty,g);
      sample(point.x,point.y,(py*width+px)*4);
    }
  }
  if(skin&&face)smoothSkin(pixels,face,skin/100,g);
  return pixels;
}

// Skin smoothing alone, for previews that cache the geometry result.
export function applyPortraitSkin(pixels,retouch,frame){
  if(!retouch?.skin||!retouch.face||frame.width*frame.height*4!==pixels.length)return pixels;
  smoothSkin(pixels,retouch.face,retouch.skin/100,frameGeometry(retouch,frame));
  return pixels;
}
