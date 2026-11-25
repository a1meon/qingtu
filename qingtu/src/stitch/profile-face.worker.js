import {env,InferenceSession,Tensor} from 'onnxruntime-web/wasm';

const size=640,area=size*size;
const canvas=new OffscreenCanvas(size,size),context=canvas.getContext('2d',{willReadFrequently:true});
let session;

async function detect(image,flip){
  const scale=Math.min(size/image.width,size/image.height);
  const width=image.width*scale,height=image.height*scale;
  const left=(size-width)/2,top=(size-height)/2;
  context.fillStyle='#000';context.fillRect(0,0,size,size);
  context.save();
  if(flip){context.translate(size,0);context.scale(-1,1);}
  context.drawImage(image,left,top,width,height);
  context.restore();
  const bytes=context.getImageData(0,0,size,size).data,input=new Float32Array(area*3);
  for(let i=0;i<area;i++){
    input[i]=bytes[i*4+2];input[i+area]=bytes[i*4+1];input[i+2*area]=bytes[i*4];
  }
  const output=await session.run({[session.inputNames[0]]:new Tensor('float32',input,[1,3,size,size])});
  let best=null,bestScore=.52;
  // Decode YuNet's three feature map scales. One portrait is edited per layer,
  // so only the highest-confidence visible box is required.
  for(const stride of [8,16,32]){
    const cls=output['cls_'+stride].data,obj=output['obj_'+stride].data,box=output['bbox_'+stride].data,kps=output['kps_'+stride].data;
    const grid=size/stride;
    for(let i=0;i<cls.length;i++){
      const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));
      if(score<=bestScore)continue;
      const x=((i%grid+box[i*4])*stride-left)/width,y=((Math.floor(i/grid)+box[i*4+1])*stride-top)/height;
      const rx=Math.exp(box[i*4+2])*stride/(2*width),ry=Math.exp(box[i*4+3])*stride/(2*height);
      if(x<0||x>1||y<0||y>1||rx<.009||ry<.009||rx>.72||ry>.72)continue;
      const nose=((i%grid+kps[i*10+4])*stride-left)/width;
      const lean=Math.max(-1,Math.min(1,(nose-x)/rx))*(flip?-1:1);
      best={x:flip?1-x:x,y,rx,ry,lean};bestScore=score;
    }
  }
  for(const value of Object.values(output))value.dispose();
  return best;
}

self.onmessage=async({data:{id,model,wasm,glue,image}})=>{
  try{
    let result;
    if(model){
      env.wasm.numThreads=1;env.wasm.proxy=false;
      env.wasm.wasmBinary=new Uint8Array(wasm);env.wasm.wasmPaths={mjs:glue};
      session=await InferenceSession.create(new Uint8Array(model),{executionProviders:['wasm']});
    }else result=await detect(image,false)||await detect(image,true);
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
  finally{image?.close();}
};
