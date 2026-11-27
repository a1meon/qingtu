export function pixelDifference(a,b,channels=4){
 let squares=0,absolute=0,max=0,alphaMax=0,count=0;
 for(let i=0;i<a.length;i++){
  const d=Math.abs(a[i]-b[i]);
  if(channels===4&&i%4===3){alphaMax=Math.max(alphaMax,d);continue;}
  squares+=d*d;absolute+=d;max=Math.max(max,d);count++;
 }
 const mse=squares/count;
 return {maxError:max,alphaMaxError:alphaMax,mae:absolute/count,rmse:Math.sqrt(mse),psnr:mse?10*Math.log10(255*255/mse):null};
}

// Full-colour bounded-error preprocessing, never an indexed palette. Alpha,
// flat regions, smooth ramps and strong edges remain exact. RGB error <= 2/255.
export function prepareBoundedPixels(data,info,copy=bytes=>new Uint8Array(bytes)){
 const {width,height,channels}=info;
 const ranked=new Uint8Array(width*height);ranked.fill(255);
 const step=5;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=(y*width+x)*channels;
  if(channels===4&&data[i+3]===0)continue;
  let contrast=0;
  for(let c=0;c<3;c++)for(const delta of [-channels,channels,-width*channels,width*channels])contrast=Math.max(contrast,Math.abs(data[i+c]-data[i+c+delta]));
  if(contrast<=2||contrast>=48)continue;
  // Stable spatial distribution lets the budget search vary continuously.
  const rank=((Math.imul(x,73856093)^Math.imul(y,19349663))>>>0)%100;
  if(data[i]===Math.min(255,Math.round(data[i]/step)*step)&&data[i+1]===Math.min(255,Math.round(data[i+1]/step)*step)&&data[i+2]===Math.min(255,Math.round(data[i+2]/step)*step))continue;
  ranked[y*width+x]=rank;
 }
 return strength=>{
  const out=copy(data);
  for(let pixel=0;pixel<ranked.length;pixel++)if(ranked[pixel]<strength){const i=pixel*channels;for(let c=0;c<3;c++)out[i+c]=Math.min(255,Math.round(data[i+c]/step)*step);}
  return out;
 };
}
