import {useEffect,useMemo,useState} from 'react';
import wasmAsset from '../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url';
import {loadPreview} from './load-preview.js';

const results=new Map(),jobs=new Map();
const pending=new Map();
let worker,workerReady,wasmReady,faceReady,poseReady,fullPoseReady,sequence=0;

function readAsset(url){
  if(location.protocol!=='file:')return fetch(url,{signal:AbortSignal.timeout(20000)}).then(response=>{
    if(!response.ok)throw new Error('识别资源加载失败');
    return response.arrayBuffer();
  });
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('GET',url);request.responseType='arraybuffer';request.timeout=20000;
    request.onload=()=>request.response?.byteLength?resolve(request.response):reject(new Error('识别资源加载失败'));
    request.onerror=request.ontimeout=()=>reject(new Error('识别资源加载失败'));request.send();
  });
}
function resetWorker(error){
  for(const request of pending.values())request.finish(error);
  pending.clear();
  worker?.terminate();worker=workerReady=wasmReady=faceReady=poseReady=fullPoseReady=undefined;
}
function getWorker(){
  workerReady??=import('./portrait-detector.worker.js?worker&inline').then(({default:Detector})=>{
    worker=new Detector();
    worker.onmessage=({data:{id,result,error}})=>pending.get(id)?.finish(error?new Error(error):null,result);
    worker.onerror=event=>resetWorker(new Error(event.message||'本机识别不可用'));
    return worker;
  });
  return workerReady;
}
async function request(data,transfer){
  const target=await getWorker();
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const deadline=setTimeout(()=>resetWorker(new Error('本机识别超时')),12000);
    const finish=(error,result)=>{
      clearTimeout(deadline);pending.delete(id);
      if(error)reject(error);else resolve(result);
    };
    pending.set(id,{finish});
    try{target.postMessage({id,...data},transfer);}
    catch(error){data.image?.close();finish(error);}
  });
}
function sendModel(kind,path){
  wasmReady??=readAsset(new URL(wasmAsset,document.baseURI)).then(buffer=>request({kind:'wasm',buffer},[buffer]))
    .catch(error=>{wasmReady=undefined;throw error;});
  return Promise.all([wasmReady,readAsset(new URL(path,document.baseURI))])
    .then(([,buffer])=>request({kind,buffer},[buffer]));
}
async function detect(kind,image,retry=false){
  if(kind==='face')await (faceReady??=sendModel('face-model','./retouch/face_landmarker.task')
    .catch(error=>{faceReady=undefined;throw error;}));
  else if(kind==='full-pose')await (fullPoseReady??=sendModel('full-pose-model','./retouch/pose_landmarker_full.task')
    .catch(error=>{fullPoseReady=undefined;throw error;}));
  else await (poseReady??=sendModel('pose-model','./retouch/pose_landmarker_lite.task')
    .catch(error=>{poseReady=undefined;throw error;}));
  const bitmap=await createImageBitmap(image);
  return request({kind,image:bitmap,retry},[bitmap]);
}

async function rasterForDetection(preview,window){
  const source=await loadPreview(preview);
  const {naturalWidth:width,naturalHeight:height}=source;
  const x=Math.min(width-1,Math.round(width*window.x)),y=Math.min(height-1,Math.round(height*window.y));
  const w=Math.max(1,Math.min(width-x,Math.round(width*window.w)));
  const h=Math.max(1,Math.min(height-y,Math.round(height*window.h)));
  const ratio=Math.min(1,700/Math.max(w,h));
  const image=await createImageBitmap(source,x,y,w,h,{
    resizeWidth:Math.max(1,Math.round(w*ratio)),resizeHeight:Math.max(1,Math.round(h*ratio)),resizeQuality:'medium',
  });
  return {image,window:{x:x/width,y:y/height,w:w/width,h:h/height}};
}

function sourceLandmarks(result,{x,y,w,h}){
  const xAt=value=>x+value*w,yAt=value=>y+value*h;
  const region=area=>area&&({...area,x:xAt(area.x),y:yAt(area.y),...(area.rx&&{rx:area.rx*w,ry:area.ry*h})});
  const legs=result.legs;
  return {...result,face:region(result.face),head:region(result.head),body:region(result.body),
    legs:legs&&({...legs,x:xAt(legs.x),hip:yAt(legs.hip),ankle:yAt(legs.ankle),foot:yAt(legs.foot),lock:yAt(legs.lock),
      core:legs.core*w,radius:Math.max(.05,legs.radius*w)})};
}

function fullHead(face,poseHead){
  if(!face)return poseHead;
  const {rx,ry,lean=0}=face;
  const top=Math.max(0,face.y-ry*2.02),bottom=Math.min(1,face.y+ry*1.24);
  const x=Math.max(0,Math.min(1,face.x-lean*rx*.36));
  return {x,y:(top+bottom)/2,rx:Math.min(.75,Math.max(rx*1.55,poseHead?.rx||0)),ry:Math.min(.75,Math.max((bottom-top)/2,poseHead?.ry||0))};
}

function inspectPreview(key,preview,requested){
  const running=jobs.get(key);
  if(running)return running;
  let result={},frame;
  const listeners=new Set(),job={listeners};
  const publish=change=>{
    result={...result,...change};
    const mapped=frame?sourceLandmarks(result,frame.window):result;
    results.delete(key);results.set(key,mapped);
    if(results.size>40)results.delete(results.keys().next().value);
    for(const listener of listeners)listener(mapped);
  };
  jobs.set(key,job);
  (async()=>{
    frame=await rasterForDetection(preview,requested);
    const {image}=frame;
    const face=await detect('face',image);
    publish({face});
    const faceTask=face?Promise.resolve(face):import('./profile-face.js')
      .then(({detectProfile})=>detectProfile(image,readAsset))
      .then(fallback=>{if(fallback)publish({face:fallback});return fallback;})
      .catch(error=>{console.warn('Profile face:',error.message);return null;});
    try{
      let pose=await detect('pose',image,!face||face.ry<.15);
      publish(pose);
      if(!pose.legs&&(pose.likelyLegs||!pose.body&&!face)){
        try{
          const full=await detect('full-pose',image,true);
          pose={...pose,body:full.body||pose.body,legs:full.legs||pose.legs,
            head:pose.head||full.head,profileFace:pose.profileFace||full.profileFace};
          publish(pose);
        }catch(error){console.warn('Full pose:',error.message);}
      }
      const detectedFace=(await faceTask)||pose.profileFace;
      publish({...pose,face:detectedFace,head:fullHead(detectedFace,pose.head),done:true});
    }finally{await faceTask;}
  })().catch(error=>{
    publish({error:true,done:true});
    console.warn('Portrait landmarks:',error.message);
  }).finally(()=>{frame?.image.close();jobs.delete(key);});
  return job;
}

export function usePortraitDetection(preview,enabled,crop,sourceKey){
  const {left=0,right=0,top=0,bottom=0}=crop||{};
  const x=Math.round(left*1000)/1000,y=Math.round(top*1000)/1000;
  const w=Math.max(.001,Math.round((1-left-right)*1000)/1000),h=Math.max(.001,Math.round((1-top-bottom)*1000)/1000);
  const key=useMemo(()=>preview&&`${sourceKey||preview}:${x},${y},${w},${h}`,[preview,sourceKey,x,y,w,h]);
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!enabled||!key)return;
    const cached=results.get(key);
    if(cached?.done&&!cached.error){setState({key,result:cached});return;}
    const listener=result=>setState({key,result});
    let job;
    const timer=setTimeout(()=>{
      job=inspectPreview(key,preview,{x,y,w,h});
      job.listeners.add(listener);
    },75);
    return()=>{clearTimeout(timer);job?.listeners.delete(listener);};
  },[key,enabled]);
  if(!enabled||!key)return null;
  return state?.key===key?state.result:results.get(key)||null;
}
