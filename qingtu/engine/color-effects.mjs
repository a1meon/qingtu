const limitByte=value=>Math.round(Math.min(255,Math.max(0,value)));

export function colorEffectFrame(rect, clip){
  const {left=0,right=0,top=0,bottom=0}=rect.crop||{};
  const spanX=1-left-right,spanY=1-top-bottom;
  const x=left+spanX*clip.sourceLeft/rect.width,y=top+spanY*clip.sourceTop/rect.height;
  return {width:clip.width,height:clip.height,crop:{left:x,top:y,
    right:x+spanX*clip.width/rect.width,bottom:y+spanY*clip.height/rect.height}};
}

function noise(x,y){
  let hash=Math.imul(374761393,x)+Math.imul(668265263,y);
  hash=Math.imul(hash^(hash>>>13),1274126177);
  return ((hash^(hash>>>16))>>>0)/4294967295-.5;
}

export function applyColorEffects(pixels,{sharpen=0,clarity=0,grain=0,vignette=0},{width,height,crop}={}){
  if(!(sharpen||clarity||grain||vignette)||!width||!height)return;
  let luminance;
  if(sharpen||clarity){
    luminance=new Uint8ClampedArray(width*height);
    for(let p=0,i=0;p<luminance.length;p++,i+=4)luminance[p]=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
  }
  const {left=0,right=1,top=0,bottom=1}=crop||{};
  const stepX=(right-left)/width,stepY=(bottom-top)/height;
  const radius=Math.max(2,Math.min(16,Math.round(Math.min(width,height)*.005)));
  const sample=(p,center)=>pixels[p*4+3]?luminance[p]:center;
  const detail=(x,y,r,center)=>{
    const row=y*width;
    const left=sample(row+Math.max(0,x-r),center),right=sample(row+Math.min(width-1,x+r),center);
    const top=sample(Math.max(0,y-r)*width+x,center),bottom=sample(Math.min(height-1,y+r)*width+x,center);
    return center-(left+right+top+bottom)/4;
  };
  for(let y=0;y<height;y++){
    const ny=top+(y+.5)*stepY,verticalDistance=(ny-.5)**2;
    for(let x=0;x<width;x++){
      const p=y*width+x,i=p*4;
      if(!pixels[i+3])continue;
      const nx=left+(x+.5)*stepX,center=luminance?.[p];
      let delta=sharpen?Math.max(-30,Math.min(30,detail(x,y,1,center)))*sharpen*.016:0;
      if(clarity)delta+=Math.max(-36,Math.min(36,detail(x,y,radius,center)))*clarity*.013;
      if(grain)delta+=noise(Math.floor(nx*2300),Math.floor(ny*2300))*grain*.25;
      const edge=vignette?Math.max(0,Math.min(1,(Math.sqrt((nx-.5)**2+verticalDistance)-.23)/.48)):0;
      const strength=vignette*.006*edge*edge*(3-2*edge);
      for(let channel=0;channel<3;channel++){
        const value=pixels[i+channel]+delta;
        pixels[i+channel]=limitByte(value-strength*(strength<0?255-value:value));
      }
    }
  }
}
