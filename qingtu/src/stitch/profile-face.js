import ProfileWorker from './profile-face.worker.js?worker&inline';
import glue from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import wasm from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

let ready,worker;
const pending=new Map();
let sequence=0;

function call(data,transfer){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>finish(new Error('侧脸识别超时')),12000);
    const finish=(error,result)=>{
      pending.delete(id);clearTimeout(timeout);
      if(error)reject(error);else resolve(result);
    };
    pending.set(id,finish);
    try{worker.postMessage({id,...data},transfer);}
    catch(error){data.image?.close();finish(error);}
  });
}

export async function detectProfile(image,readAsset){
  ready??=(async()=>{
    const modelUrl=new URL('./retouch/face_detection_yunet.onnx',document.baseURI);
    const wasmUrl=new URL(wasm,document.baseURI),glueUrl=new URL(glue,document.baseURI);
    const [model,wasmBytes]=await Promise.all([readAsset(modelUrl),readAsset(wasmUrl)]);
    worker=new ProfileWorker();
    worker.onmessage=({data:{id,result,error}})=>pending.get(id)?.(error?new Error(error):null,result);
    worker.onerror=event=>{for(const finish of pending.values())finish(new Error(event.message||'侧脸识别不可用'));};
    await call({model,wasm:wasmBytes,glue:glueUrl.href},[model,wasmBytes]);
  })().catch(error=>{worker?.terminate();worker=ready=undefined;throw error;});
  await ready;
  const bitmap=await createImageBitmap(image);
  return call({image:bitmap},[bitmap]);
}
