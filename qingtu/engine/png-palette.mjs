// Variance-based colour quantisation. Partition a bounded sample, then classify
// the full raster once. Smaller palettes merge leaves of this same colour tree.
function makeNode(colors){
 const sum=[0,0,0,0],squares=[0,0,0,0];
 let hasClear=false,hasOpaque=false,hasPartial=false;
 for(const color of colors){
  for(let c=0;c<4;c++){sum[c]+=color[c];squares[c]+=color[c]*color[c];}
  if(color[3]===0)hasClear=true;else if(color[3]===255)hasOpaque=true;else hasPartial=true;
 }
 const mean=sum.map(n=>n/colors.length);
 const variance=squares.map((n,c)=>Math.max(0,n-sum[c]*mean[c]));
 let axis=variance.indexOf(Math.max(...variance)),cut=mean[axis],score=variance[axis];
 if(hasClear&&(hasOpaque||hasPartial)){axis=3;cut=0;score=Infinity;}
 else if(hasOpaque&&hasPartial){axis=3;cut=254;score=Infinity;}
 const alpha=mean[3],rgba=mean.map((n,c)=>Math.round(c===3?n:alpha?Math.min(255,n*255/alpha):0));
 return {colors,axis,cut,score,rgba};
}

export function adaptivePalette(data,{width,height,channels}){
 const count=width*height,samples=[],limit=Math.min(32768,count);
 function sample(i){
  const a=channels===4?data[i+3]:255,weight=a/255;
  samples.push([data[i]*weight,data[i+1]*weight,data[i+2]*weight,a]);
 }
 let seed=42;
 for(let n=0;n<limit;n++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  sample(Math.floor((n+seed/4294967296)*count/limit)*channels);
 }
 if(channels===4&&count>limit){
  const seen=new Set();
  for(let i=3;i<data.length&&seen.size<3;i+=4){
   const a=data[i],key=a===0?0:a===255?2:1;
   if(!seen.has(key)){seen.add(key);sample(i-3);}
  }
 }
 const root=makeNode(samples),leaves=[root],splits=[];
 while(leaves.length<256){
  let pos=0;for(let i=1;i<leaves.length;i++)if(leaves[i].score>leaves[pos].score)pos=i;
  const node=leaves[pos];if(node.score<.000001)break;
  const left=[],right=[];
  for(const color of node.colors)(color[node.axis]<=node.cut?left:right).push(color);
  if(!left.length||!right.length){node.score=0;continue;}
  node.left=makeNode(left);node.right=makeNode(right);node.colors=null;
  node.split=splits.length;splits.push(node);leaves.splice(pos,1,node.left,node.right);
 }
 leaves.forEach((node,id)=>{node.id=id;node.colors=null;});
 function leafFor(r,g,b,alpha){
  let node=root;
  while(node.left){
   const axis=node.axis,value=axis===0?r:axis===1?g:axis===2?b:alpha;
   node=value<=node.cut?node.left:node.right;
  }
  return node;
 }
 const indices=new Uint8Array(count);
 for(let p=0,i=0;p<count;p++,i+=channels){
  const alpha=channels===4?data[i+3]:255,weight=alpha/255;
  indices[p]=leafFor(data[i]*weight,data[i+1]*weight,data[i+2]*weight,alpha).id;
 }
 function at(size){
  const lookup=new Uint8Array(leaves.length),palette=[];
  function visit(node,id){
   if(id===undefined&&(!node.left||node.split>=size-1)){id=palette.length;palette.push(node.rgba);}
   if(node.left){visit(node.left,id);visit(node.right,id);}else lookup[node.id]=id;
  }
  visit(root);return {palette,lookup};
 }
 // Floyd–Steinberg diffusion uses remaining bytes to reproduce intermediate
 // RGB tones. Classify at the source alpha and diffuse only visible colour.
 function diffuse(strength){
  const result=new Uint8Array(count),stride=(width+2)*3;
  let current=new Float32Array(stride),next=new Float32Array(stride);
  for(let y=0;y<height;y++){
   for(let x=0;x<width;x++){
    const p=y*width+x,i=p*channels,e=(x+1)*3;
    const a=channels===4?data[i+3]:255,w=a/255;
    const r=data[i]*w+current[e],g=data[i+1]*w+current[e+1],b=data[i+2]*w+current[e+2];
    const leaf=leafFor(r,g,b,a);result[p]=leaf.id;
    if(!a)continue;
    for(let c=0;c<3;c++){
     const delta=((c===0?r:c===1?g:b)-leaf.rgba[c]*w)*strength/16;
     current[e+3+c]+=7*delta;next[e-3+c]+=3*delta;next[e+c]+=5*delta;next[e+3+c]+=delta;
    }
   }
   [current,next]=[next,current];next.fill(0);
  }
  return result;
 }
 function classify(pixels,i){
  const a=channels===4?pixels[i+3]:255,w=a/255;
  return leafFor(pixels[i]*w,pixels[i+1]*w,pixels[i+2]*w,a).id;
 }
 return {indices,count:leaves.length,at,diffuse,classify};
}

export function averageCells(data,{width,height,channels},columns,rows){
 const reduced=new Uint8Array(columns*rows*channels);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const left=Math.floor(x*width/columns),right=Math.floor((x+1)*width/columns);
  const top=Math.floor(y*height/rows),bottom=Math.floor((y+1)*height/rows);
  let r=0,g=0,b=0,alpha=0;
  for(let py=top;py<bottom;py++){
   for(let px=left,i=(py*width+left)*channels;px<right;px++,i+=channels){
    const a=channels===4?data[i+3]:255;
    alpha+=a;r+=a*data[i];g+=a*data[i+1];b+=a*data[i+2];
   }
  }
  const dest=(y*columns+x)*channels;
  if(alpha){reduced[dest]=Math.round(r/alpha);reduced[dest+1]=Math.round(g/alpha);reduced[dest+2]=Math.round(b/alpha);}
  if(channels===4)reduced[dest+3]=Math.round(alpha/((right-left)*(bottom-top)));
 }
 return reduced;
}
