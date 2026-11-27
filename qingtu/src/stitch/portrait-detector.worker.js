import {FaceLandmarker,PoseLandmarker} from '@mediapipe/tasks-vision';
import createWasm from 'virtual:retouch-wasm-factory';

let wasm,faceModel,poseModel,fullPoseModel;
// Emscripten's classic script logger expects a global in strict module workers.
self.custom_dbg=message=>console.debug(message);

async function create(Model,buffer,options){
  self.ModuleFactory=createWasm;
  self.Module={wasmBinary:wasm};
  return Model.createFromOptions({wasmLoaderPath:'',wasmBinaryPath:''},{
    baseOptions:{modelAssetBuffer:new Uint8Array(buffer),delegate:'CPU'},runningMode:'IMAGE',...options,
  });
}

const unit=value=>Math.max(0,Math.min(1,value));
const visible=(p,threshold=.39)=>p&&p.visibility>=threshold&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
function faceGeometry(points){
  if(!points?.length)return null;
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
  const left=unit(Math.min(...xs)),right=unit(Math.max(...xs));
  const top=unit(Math.min(...ys)),bottom=unit(Math.max(...ys));
  if(right-left<.018||bottom-top<.018)return null;
  const x=(left+right)/2,rx=(right-left)/2,lean=Math.max(-1,Math.min(1,(points[1].x-x)/rx));
  return {x,y:(top+bottom)/2,rx,ry:(bottom-top)/2,lean};
}

function legGeometry(points){
  if(!points?.length)return null;
  const limbs=[[23,25,27,29,31],[24,26,28,30,32]].map(indices=>indices.map(index=>points[index]))
    .filter(([hip,knee,ankle])=>[hip,knee,ankle].every(p=>visible(p,.31))&&
      knee.y>hip.y+.012&&ankle.y>knee.y+.018&&ankle.y-hip.y>=.075);
  if(!limbs.length)return null;
  const average=key=>limbs.reduce((sum,limb)=>sum+limb[key].y,0)/limbs.length;
  const hip=average(0),ankle=average(2),tracked=limbs.flatMap(limb=>limb.filter(p=>visible(p,.25)));
  const xs=tracked.map(p=>p.x),l=Math.min(...xs),r=Math.max(...xs);
  const foot=Math.min(1,Math.max(ankle+.021,...limbs.flatMap(limb=>limb.slice(2).filter(p=>visible(p,.25)).map(p=>p.y))));
  const footwear=limbs.flatMap(limb=>limb.slice(2).filter(p=>visible(p,.31)));
  const firstShoePoint=Math.min(...footwear.map(p=>p.y));
  const ankleBuffer=Math.min(.022,(ankle-average(1))*.13);
  const lock=Math.max(hip+.012,firstShoePoint-ankleBuffer);
  const core=Math.min(.72,(r-l)/2+.05),radius=Math.min(1,Math.max(.22,core+.20));
  return {hip,ankle,x:(l+r)/2,foot,lock,core,radius};
}

function poseGeometry(points,width,height){
  if(!points?.length)return {};
  const legs=legGeometry(points);
  const shoulders=[points[11],points[12]].filter(p=>visible(p));
  const hips=[points[23],points[24]].filter(p=>visible(p));
  const knees=[points[25],points[26]].filter(p=>visible(p));
  const torso=[...shoulders,...hips];
  const reliable=shoulders.length&&hips.length&&Math.max(...hips.map(p=>p.y))-Math.min(...shoulders.map(p=>p.y))>.09;
  const landmarks=(reliable?torso:hips.length&&knees.length?[...hips,...knees]:[]).filter(Boolean);
  const body=landmarks.length?{
    x:landmarks.reduce((sum,p)=>sum+p.x,0)/landmarks.length,
    y:landmarks.reduce((sum,p)=>sum+p.y,0)/landmarks.length,
  }:null;
  const nose=points[0],ears=[points[7],points[8]].filter(p=>visible(p,.50));
  const eyes=[points[2],points[5]].filter(p=>visible(p,.53));
  let head,profileFace;
  if(visible(nose,.54)&&ears.length&&eyes.length){
    const aspect=width/height;
    const xs=[nose,...ears,...eyes].map(p=>p.x),ys=[nose,...ears,...eyes].map(p=>p.y);
    const left=Math.min(...xs),right=Math.max(...xs),upper=Math.min(...ys),lower=Math.max(...ys);
    const rx=Math.max(.015,(right-left)*(ears.length>1?.80:1.05)),ry=Math.min(.25,Math.max(.02,rx*aspect*1.25,(lower-upper)*1.75));
    const y=unit((upper+lower)/2-ry*.22);
    const x=(left+right)/2;
    if(y-ry>.005&&y+ry<1)head={x,y,rx,ry};
    if(head&&(!shoulders.length||nose.y<Math.min(...shoulders.map(p=>p.y))-.025)){
      profileFace={x,y:y+ry*.18,rx:rx*.78,ry:ry*.70,lean:Math.max(-1,Math.min(1,(nose.x-x)/rx))};
    }
  }
  return {body,legs,head,profileFace,likelyLegs:!!(knees.length||hips.length&&Math.min(...hips.map(p=>p.y))<.68)};
}

// Transform results back to the original raster after a bounded crop, mirror
// or padded pose retry. Blank space outside the source never counts as visible.
function framed(image,{x=0,y=0,w=1,h=1,flip=false},run){
  const width=Math.max(2,Math.round(w*image.width)),height=Math.max(2,Math.round(h*image.height));
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
  ctx.fillStyle='#dedede';ctx.fillRect(0,0,width,height);
  if(flip){ctx.translate(width,0);ctx.scale(-1,1);}
  ctx.drawImage(image,-x/w*width,-y/h*height,width/w,height/h);
  return run(canvas)?.map(point=>({...point,x:x+(flip?1-point.x:point.x)*w,y:y+point.y*h}));
}

function detectFace(image){
  const run=input=>faceModel.detect(input).faceLandmarks[0];
  const direct=faceGeometry(run(image));
  if(direct)return direct;
  for(const view of [{flip:true},{x:.13,y:.03,w:.74,h:.78},{x:.10,y:0,w:.8,h:.58,flip:true},{x:0,y:0,w:.82,h:.64},{x:.18,y:0,w:.82,h:.64,flip:true}]){
    const face=faceGeometry(framed(image,view,run));
    if(face)return face;
  }
  return null;
}

function detectPose(image,model,retry){
  const run=input=>model.detect(input).landmarks[0];
  const direct=poseGeometry(run(image),image.width,image.height);
  if(!retry||direct.legs)return direct;
  // The detector expects some room above the shoulders. Give cropped source
  // images extra headroom while keeping out-of-image landmarks unavailable.
  const views=[{x:-.12,y:-.36,w:1.24,h:1.42},{x:.08,y:-.26,w:.84,h:1.31,flip:true},{x:-.06,y:-.49,w:1.12,h:1.54}];
  let best=direct;
  for(const view of views){
    const pose=poseGeometry(framed(image,view,run),image.width,image.height);
    if(pose.legs)return {...pose,head:direct.head||pose.head};
    if(pose.body&&!best.body)best=pose;
  }
  return best;
}

const poseOptions={numPoses:1,minPoseDetectionConfidence:.34,minPosePresenceConfidence:.34};
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(async()=>{
    const {id,kind,image,buffer,retry}=data;
    try{
      if(kind==='wasm'){wasm=buffer;self.postMessage({id});return;}
      if(kind==='face-model')faceModel=await create(FaceLandmarker,buffer,{numFaces:1,minFaceDetectionConfidence:.40,minFacePresenceConfidence:.37});
      else if(kind==='pose-model')poseModel=await create(PoseLandmarker,buffer,poseOptions);
      else if(kind==='full-pose-model')fullPoseModel=await create(PoseLandmarker,buffer,poseOptions);
      const result=kind==='face'?detectFace(image):
        kind==='pose'||kind==='full-pose'?detectPose(image,kind==='pose'?poseModel:fullPoseModel,retry):undefined;
      self.postMessage({id,result});
    }catch(error){self.postMessage({id,error:error.message});}
    finally{image?.close();}
  });
};
