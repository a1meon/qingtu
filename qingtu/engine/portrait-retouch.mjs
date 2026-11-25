const unit=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const x=unit(value);return x*x*(3-2*x);};
const within=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;

export const maxLiquifyStrokes=32;
export const maxLiquifyDabs=80;

export function extendLiquifyPath(path,last,point,radius,radiusY,kind,finish=false){
  const dx=point.x-last.x,dy=point.y-last.y;
  const distance=Math.hypot(dx/radius,dy/radiusY);
  const spacing=kind==='pinch'?.58:.23;
  const count=Math.min(maxLiquifyDabs-path.length,Math.floor(distance/spacing));
  const fraction=distance?Math.min(1,spacing/distance):0;
  for(let i=0;i<count;i++){
    const step=kind==='pinch'?i+1:i+.5;
    path.push({x:unit(last.x+dx*fraction*step),y:unit(last.y+dy*fraction*step),
      dx:kind==='pinch'?radius*.23:dx*fraction,dy:kind==='pinch'?0:dy*fraction,radius,radiusY});
  }
  const consumed=fraction*count;
  if(finish&&kind==='push'&&path.length<maxLiquifyDabs&&(1-consumed)*distance>.035){
    const midpoint=(1+consumed)/2;
    path.push({x:unit(last.x+dx*midpoint),y:unit(last.y+dy*midpoint),dx:dx*(1-consumed),dy:dy*(1-consumed),radius,radiusY});
    return point;
  }
  return {x:last.x+dx*consumed,y:last.y+dy*consumed};
}

export function portraitPoint({x,y},turn){
  if(turn===90)return {x:1-y,y:x};
  if(turn===180)return {x:1-x,y:1-y};
  if(turn===270)return {x:y,y:1-x};
  return {x,y};
}

export function normalizePortraitRetouch(value){
  if(value===undefined)return undefined;
  const invalid=()=>{throw new Error('美颜参数无效');};
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const {face,legs,head,slim=0,skin=0,length=0,headSize=0,strokes=[],turn=0}=value;
  if(![0,90,180,270].includes(turn)||![slim,skin,length,headSize].every(amount=>within(amount,0,100))||
     !Array.isArray(strokes)||strokes.length>maxLiquifyStrokes)invalid();
  const box=region=>{
    if(!region||!within(region.x,0,1)||!within(region.y,0,1)||!within(region.rx,.005,.75)||!within(region.ry,.005,.75))invalid();
    return {x:region.x,y:region.y,rx:region.rx,ry:region.ry};
  };
  if(length&&(!legs||!within(legs.hip,0,1)||!within(legs.ankle,legs.hip+.025,1)||
     !within(legs.x,0,1)||!within(legs.radius,.05,1)||
     legs.foot!==undefined&&!within(legs.foot,legs.ankle,1)||
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
  if(!slim&&!skin&&!length&&!headSize&&!brushes.length)return undefined;
  return {turn,...(slim||skin?{face:box(face),slim,skin}:{}),
    ...(headSize?{head:box(head),headSize}:{}),
    ...(length?{legs:{hip:legs.hip,ankle:legs.ankle,x:legs.x,radius:legs.radius,
      ...(legs.foot!==undefined&&{foot:legs.foot}),...(legs.lock!==undefined&&{lock:legs.lock}),...(legs.core!==undefined&&{core:legs.core})},length}:{}),
    ...(brushes.length?{strokes:brushes}:{})};
}

export function hasPortraitRetouch(value){
  return !!(value?.slim||value?.skin||value?.length||value?.headSize||value?.strokes?.length);
}

function stretchProfile(legs,amount){
  if(!amount)return;
  const {hip,ankle}=legs,lock=legs.lock??Math.max(hip+.012,ankle-.023);
  const span=lock-hip,offset=Math.min(hip*.29,span*.23)*amount/100;
  return {hip,lock,offset,raised:hip-offset,anchor:Math.max(0,hip-span*.60)};
}

function stretchedLegSource(y,{lock,offset,raised,anchor}){
  // Below the upper ankle boundary source pixels remain at their exact
  // coordinates, including the shoes, their silhouette, and their shadows.
  if(y<anchor||y>=lock)return y;
  const weight=y<raised?smooth((y-anchor)/Math.max(.001,raised-anchor)):
    smooth((lock-y)/Math.max(.001,lock-raised));
  return y+offset*weight;
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

function softBrushMesh(brush,{startX,startY,endX,endY,width,height,left,top,spanX,spanY,inverse}){
  const step=Math.max(2,Math.round(Math.max(width,height)/390));
  const cols=Math.ceil((endX-startX)/step)+1,rows=Math.ceil((endY-startY)/step)+1;
  const grid=new Float32Array(cols*rows*2),offset=[0,0];
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const point=portraitPoint({x:left+(startX+col*step+.5)/width*spanX,y:top+(startY+row*step+.5)/height*spanY},inverse);
    brush(point.x,point.y,offset);
    const at=(row*cols+col)*2;
    grid[at]=offset[0]-point.x;grid[at+1]=offset[1]-point.y;
  }
  return (px,py,out)=>{
    const gx=(px-startX)/step,gy=(py-startY)/step,col=Math.floor(gx),row=Math.floor(gy);
    const x=gx-col,y=gy-row,at=(row*cols+col)*2,next=at+cols*2;
    for(let channel=0;channel<2;channel++){
      const a=at+channel,b=next+channel;
      out[channel]=(grid[a]*(1-x)+grid[a+2]*x)*(1-y)+(grid[b]*(1-x)+grid[b+2]*x)*y;
    }
  };
}

// For the raster, convert each affected destination pixel to a source
// coordinate. Sample RGBA together so transparent edges stay transparent.
export function applyPortraitRetouch(pixels,retouch,{width,height,crop}){
  if(!hasPortraitRetouch(retouch)||width*height*4!==pixels.length)return pixels;
  const {face,legs,head,slim=0,skin=0,length=0,headSize=0,strokes=[],turn=0}=retouch;
  const {left=0,top=0,right=1,bottom=1}=crop||{},spanX=right-left,spanY=bottom-top;
  const source=new Uint8ClampedArray(pixels);
  const inverse=(360-turn)%360;
  const aspect=(turn%180?height/width*spanX/spanY:width/height*spanY/spanX);
  const profile=stretchProfile(legs,length);
  const dabs=strokes.flatMap((stroke,group)=>(stroke.path||[stroke]).map(dab=>({
    ...dab,kind:stroke.kind,soft:stroke.soft,group,radiusY:dab.radiusY??dab.radius*aspect,
  })));
  const brush=dabs.length?makeBrushOffset(brushCells(dabs),aspect):null;
  const bounds=[];
  if(face&&(slim||skin))bounds.push([face.x-face.rx*1.65,face.y-face.ry*1.48,face.x+face.rx*1.65,face.y+face.ry*1.48]);
  if(headSize)bounds.push([head.x-head.rx*1.85,head.y-head.ry*1.77,head.x+head.rx*1.85,head.y+head.ry*1.77]);
  if(profile)bounds.push([legs.x-legs.radius,profile.anchor,legs.x+legs.radius,profile.lock]);
  dabs.forEach(({x,y,radius,radiusY,soft})=>{const spread=soft?1.54:1;bounds.push([x-radius*spread,y-radiusY*spread,x+radius*spread,y+radiusY*spread]);});
  const corners=bounds.flatMap(([x0,y0,x1,y1])=>[portraitPoint({x:x0,y:y0},turn),portraitPoint({x:x1,y:y1},turn)]);
  const startX=Math.floor(unit((Math.min(...corners.map(point=>point.x))-left)/spanX)*width);
  const endX=Math.ceil(unit((Math.max(...corners.map(point=>point.x))-left)/spanX)*width);
  const startY=Math.floor(unit((Math.min(...corners.map(point=>point.y))-top)/spanY)*height);
  const endY=Math.ceil(unit((Math.max(...corners.map(point=>point.y))-top)/spanY)*height);
  if(startX>=endX||startY>=endY)return pixels;
  const mesh=dabs.length&&strokes.some(stroke=>stroke.soft)&&
    softBrushMesh(brush,{startX,startY,endX,endY,width,height,left,top,spanX,spanY,inverse});
  const displacement=[0,0];
  const blurRadius=Math.max(1,Math.min(24,Math.round((face?.rx||0)*(turn%180?height/spanY:width/spanX)*.105)));
  const offsets=skin?[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]].map(([x,y])=>(x+y*width)*blurRadius*4):[];

  function sample(x,y,index){
    const fx=Math.max(0,Math.min(width-1,((x-left)/spanX)*width-.5));
    const fy=Math.max(0,Math.min(height-1,((y-top)/spanY)*height-.5));
    const row=Math.floor(fy),col=Math.floor(fx),a=fx-col,b=fy-row;
    const i=(row*width+col)*4,dx=col+1<width?4:0,dy=row+1<height?width*4:0;
    const w0=(1-a)*(1-b),w1=a*(1-b),w2=(1-a)*b,w3=a*b;
    const alpha=source[i+3]*w0+source[i+dx+3]*w1+source[i+dy+3]*w2+source[i+dy+dx+3]*w3;
    pixels[index+3]=Math.round(alpha);
    if(!alpha)return;
    for(let c=0;c<3;c++){
      pixels[index+c]=Math.round((source[i+c]*source[i+3]*w0+source[i+dx+c]*source[i+dx+3]*w1+
        source[i+dy+c]*source[i+dy+3]*w2+source[i+dy+dx+c]*source[i+dy+dx+3]*w3)/alpha);
    }
  }

  for(let py=startY;py<endY;py++)for(let px=startX;px<endX;px++){
    const tx=left+(px+.5)/width*spanX,ty=top+(py+.5)/height*spanY;
    const original=portraitPoint({x:tx,y:ty},inverse);
    let {x,y}=original;
    if(mesh){mesh(px,py,displacement);x+=displacement[0];y+=displacement[1];}
    else if(brush){brush(x,y,displacement);x=displacement[0];y=displacement[1];}
    if(profile&&y<profile.lock&&Math.abs(x-legs.x)<legs.radius){
      const core=legs.core??legs.radius*.38;
      const weight=smooth((legs.radius-Math.abs(x-legs.x))/Math.max(.001,legs.radius-core));
      y+=(stretchedLegSource(y,profile)-y)*weight;
    }
    if(headSize){
      const nx=Math.abs(x-head.x)/head.rx,ny=Math.abs(y-head.y)/head.ry;
      const outline=Math.max(nx,ny)+.16*Math.min(nx,ny);
      const taper=smooth((1.73-outline)/.70);
      const amount=headSize*.00235*taper;
      x+=(x-head.x)*amount;y+=(y-head.y)*amount;
    }
    let skinWeight=0;
    if(face&&(slim||skin)){
      const nx=(x-face.x)/face.rx,ny=(y-face.y)/face.ry;
      if(slim){
        const sides=smooth(Math.abs(nx)*1.35),falloff=smooth(1.48-(nx/1.43)**2-(ny/1.32)**2);
        const contour=.69+.31*smooth((ny+.7)*.85);
        x+=(x-face.x)*(.52*slim/100)*sides*falloff*contour;
      }
      if(skin)skinWeight=(skin/100)*smooth(1.53-(nx/.94)**2-(ny/1.06)**2)*.92;
    }
    const point=portraitPoint({x,y},turn),i=(py*width+px)*4;
    if(x!==original.x||y!==original.y)sample(point.x,point.y,i);
    if(skinWeight>.002&&source[i+3]===255&&pixels[i+3]===255&&
      px>=blurRadius&&px+blurRadius<width&&py>=blurRadius&&py+blurRadius<height){
      const centerX=Math.max(blurRadius,Math.min(width-1-blurRadius,Math.floor((point.x-left)/spanX*width)));
      const centerY=Math.max(blurRadius,Math.min(height-1-blurRadius,Math.floor((point.y-top)/spanY*height)));
      const center=(centerY*width+centerX)*4;
      let red=0,green=0,blue=0,total=0;
      for(const d of offsets){
        const n=center+d;
        if(source[n+3]!==255)continue;
        const r=source[n]-pixels[i],g=source[n+1]-pixels[i+1],b=source[n+2]-pixels[i+2];
        const weight=smooth(1-Math.max(Math.abs(r),Math.abs(g),Math.abs(b))/49);
        red+=r*weight;green+=g*weight;blue+=b*weight;total+=weight;
      }
      const mix=skinWeight/Math.max(1,total);
      pixels[i]=Math.round(pixels[i]+red*mix);pixels[i+1]=Math.round(pixels[i+1]+green*mix);pixels[i+2]=Math.round(pixels[i+2]+blue*mix);
    }
  }
  return pixels;
}
