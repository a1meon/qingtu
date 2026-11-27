const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const bounded = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

export const hslBands = [
  {key:'red', label:'红', hue:0}, {key:'orange', label:'橙', hue:30},
  {key:'yellow', label:'黄', hue:60}, {key:'green', label:'绿', hue:120},
  {key:'cyan', label:'青', hue:180}, {key:'blue', label:'蓝', hue:224},
  {key:'purple', label:'紫', hue:275}, {key:'magenta', label:'洋红', hue:320},
];
export const hslControls = [
  {key:'hue', label:'色相', max:60}, {key:'saturation', label:'饱和度', max:100},
  {key:'lightness', label:'明度', max:100},
];
export const curveChannels = ['rgb','red','green','blue'];
export const neutralCurve = [[0,0],[255,255]];
export const wheelRanges = [{key:'shadows',label:'阴影'},{key:'midtones',label:'中间调'},{key:'highlights',label:'高光'}];

export const maxHslSamples=16;
export const hslSampleKey=rgb=>rgb.map(value=>value.toString(16).padStart(2,'0')).join('');
const hslLimits=Object.fromEntries(hslControls.map(({key,max})=>[key,max]));

function normalizeHslSamples(samples){
  if(samples===undefined)return;
  if(!Array.isArray(samples)||samples.length>maxHslSamples)throw new Error('HSL 取色列表无效');
  const seen=new Set();
  const normalized=samples.map(sample=>{
    const {rgb,adjustment={}}=sample||{};
    if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(channel=>!Number.isInteger(channel)||!bounded(channel,0,255)))
      throw new Error('HSL 取色无效');
    const key=hslSampleKey(rgb);
    if(seen.has(key))throw new Error('HSL 取色重复');
    seen.add(key);
    return {rgb:[...rgb],adjustment:normalizeScalars(adjustment,hslLimits)};
  });
  if(normalized.length)return normalized;
}

export function hasSampledHsl(color){
  return !!color?.hslSamples?.some(sample=>Object.values(sample.adjustment||{}).some(Boolean));
}

function normalizeRecord(value, keys, normalize){
  if(value===undefined)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('高级调色参数无效');
  const entries=[];
  for(const [key, item] of Object.entries(value)){
    if(!keys.includes(key))throw new Error('高级调色参数无效');
    const normalized=normalize(item);
    if(normalized)entries.push([key,normalized]);
  }
  return entries.length?Object.fromEntries(entries):undefined;
}

function normalizeScalars(value, limits){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('高级调色参数无效');
  return Object.fromEntries(Object.entries(value).filter(([key,number])=>{
    if(!Object.hasOwn(limits,key)||!bounded(number,-limits[key],limits[key]))throw new Error('高级调色参数无效');
    return number!==0;
  }));
}

function normalizeCurve(points){
  if(!Array.isArray(points)||points.length<2||points.length>12||
      points[0]?.[0]!==0||points.at(-1)?.[0]!==255||
      points.some((point,i)=>!Array.isArray(point)||point.length!==2||
        point.some(value=>!Number.isInteger(value)||!bounded(value,0,255))||i>0&&point[0]<=points[i-1][0])){
    throw new Error('曲线控制点无效');
  }
  return points.some(([x,y])=>x!==y)?points.map(point=>[...point]):undefined;
}

export function normalizeAdvancedColor({hsl,hslSamples,curves,wheels}){
  const samples=normalizeHslSamples(hslSamples);
  const bands=normalizeRecord(hsl,hslBands.map(({key})=>key),value=>{
    const adjustment=normalizeScalars(value,hslLimits);
    return Object.keys(adjustment).length?adjustment:undefined;
  });
  const channelCurves=normalizeRecord(curves,curveChannels,normalizeCurve);
  const ranges=normalizeRecord(wheels,wheelRanges.map(({key})=>key),value=>{
    const adjustment=normalizeScalars(value,{x:100,y:100,lightness:100});
    if(Math.hypot(adjustment.x||0,adjustment.y||0)>100.01)throw new Error('色轮超出范围');
    return Object.keys(adjustment).length?adjustment:undefined;
  });
  return {...(samples&&{hslSamples:samples}),...(bands&&{hsl:bands}),...(channelCurves&&{curves:channelCurves}),...(ranges&&{wheels:ranges})};
}

export function hasAdvancedColor(color){
  return Object.values(color?.hsl||{}).some(band=>Object.values(band).some(Boolean))||
    Object.values(color?.curves||{}).some(points=>points.some(([x,y])=>x!==y))||
    Object.values(color?.wheels||{}).some(wheel=>Object.values(wheel).some(Boolean));
}

// Shape-preserving cubic interpolation between the user's ordered points.
export function curveTable(points=neutralCurve){
  const values=new Uint8ClampedArray(256);
  const slopes=points.slice(1).map(([x,y],i)=>(y-points[i][1])/(x-points[i][0]));
  const tangent=points.map((_,i)=>{
    if(i===0)return slopes[0];
    if(i===points.length-1)return slopes.at(-1);
    const left=slopes[i-1],right=slopes[i];
    return left*right>0?2*left*right/(left+right):0;
  });
  for(let i=0;i<points.length-1;i++){
    const [x0,y0]=points[i],[x1,y1]=points[i+1],width=x1-x0;
    for(let x=x0;x<=x1;x++){
      const t=(x-x0)/width,t2=t*t,t3=t2*t;
      values[x]=clamp((2*t3-3*t2+1)*y0+(t3-2*t2+t)*width*tangent[i]+
        (-2*t3+3*t2)*y1+(t3-t2)*width*tangent[i+1],Math.min(y0,y1),Math.max(y0,y1));
    }
  }
  return values;
}

function hslTable(bands){
  const table=new Float32Array(360*3);
  hslBands.forEach((band,i)=>{
    const next=hslBands[(i+1)%hslBands.length],end=next.hue||360;
    for(let hue=band.hue;hue<end;hue++){
      const weight=(hue-band.hue)/(end-band.hue);
      hslControls.forEach(({key},axis)=>{table[hue*3+axis]=(1-weight)*(bands[band.key]?.[key]||0)+weight*(bands[next.key]?.[key]||0);});
    }
  });
  return table;
}

function applyHsl(pixels,bands){
  const table=hslTable(bands);
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),chroma=max-min;
    if(chroma<1/255)continue;
    const hue=60*(max===r?(g-b)/chroma:max===g?2+(b-r)/chroma:4+(r-g)/chroma);
    const at=(Math.round(hue)+360)%360*3;
    if(!(table[at]||table[at+1]||table[at+2]))continue;
    const weight=Math.min(1,chroma*9),light=(max+min)/2;
    const newLight=clamp(light+.004*weight*table[at+2],0,1);
    const saturation=clamp(chroma/(1-Math.abs(2*light-1))*(1+.01*weight*table[at+1]),0,1);
    const h=((hue+weight*table[at])/60+6)%6;
    const c=(1-Math.abs(2*newLight-1))*saturation,m=newLight-c/2;
    const channel=n=>{const k=(n+h)%6;return Math.round(255*(m+c*(1-clamp(Math.min(k,4-k),0,1))));};
    pixels[i]=channel(5);pixels[i+1]=channel(3);pixels[i+2]=channel(1);
  }
}

function wheelTable(wheels){
  return Array.from({length:256},(_,n)=>{
    const light=n/255,dark=1-light,weights=[dark**3,4*dark*light,light**3];
    const delta=[0,0,0];
    wheelRanges.forEach(({key},i)=>{
      const wheel=wheels[key];if(!wheel)return;
      const x=wheel.x||0,y=wheel.y||0,angle=(Math.atan2(y,x)/(2*Math.PI)+1)%1;
      const strength=Math.hypot(x,y)*.002*weights[i],lift=(wheel.lightness||0)*.0035*weights[i];
      const tint=[0,1/3,2/3].map(phase=>Math.cos((angle-phase)*2*Math.PI));
      const neutral=.2126*tint[0]+.7152*tint[1]+.0722*tint[2];
      for(let channel=0;channel<3;channel++)delta[channel]+=255*(lift+strength*(tint[channel]-neutral));
    });
    return delta;
  });
}

export function applyAdvancedColor(pixels,{hsl,curves,wheels}){
  if(hsl)applyHsl(pixels,hsl);
  const rgb=curves?.rgb&&curveTable(curves.rgb);
  const channels=curveChannels.slice(1).map(key=>curves?.[key]&&curveTable(curves[key]));
  const shading=wheels&&wheelTable(wheels);
  if(!curves&&!shading)return;
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    const tint=shading?.[Math.round(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])];
    for(let channel=0;channel<3;channel++){
      const index=i+channel,value=rgb?.[pixels[index]]??pixels[index];
      const corrected=channels[channel]?.[value]??value;
      pixels[index]=Math.round(clamp(corrected+(tint?.[channel]||0),0,255));
    }
  }
}


// Samples are recorded in displayed sRGB, so this pass follows the existing
// grading stack. Evaluate old samples first to match the colour the user saw
// when recording each new point.
export function applySampledHsl(pixels,samples){
  const active=samples.filter(({adjustment})=>Object.values(adjustment).some(Boolean)).reverse();
  const limit=58*58;
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    for(const {rgb:[red,green,blue],adjustment} of active){
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      const distance=(r-red)**2+(g-green)**2+(b-blue)**2;
      if(distance>=limit)continue;
      const t=1-distance/limit,weight=t*t*(3-2*t);
      const max=Math.max(r,g,b),min=Math.min(r,g,b),c=(max-min)/255;
      const l=(max+min)/510,newLight=clamp(l+.004*weight*(adjustment.lightness||0),0,1);
      const saturation=c?clamp(c/(1-Math.abs(2*l-1))*(1+.01*weight*(adjustment.saturation||0)),0,1):0;
      const hue=c?(max===r?(g-b)/(max-min):max===g?2+(b-r)/(max-min):4+(r-g)/(max-min)):0;
      const h=(hue+weight*(adjustment.hue||0)/60+6)%6;
      const chroma=(1-Math.abs(2*newLight-1))*saturation,m=newLight-chroma/2;
      const channel=n=>{const k=(n+h)%6;return Math.round(255*(m+chroma*(1-clamp(Math.min(k,4-k),0,1))));};
      pixels[i]=channel(5);pixels[i+1]=channel(3);pixels[i+2]=channel(1);
    }
  }
}
