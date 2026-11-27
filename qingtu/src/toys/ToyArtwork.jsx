import {createElement,useEffect,useState} from 'react';
import {SpinnerGap,WarningCircle} from '@phosphor-icons/react';
import catalog from '../../desktop/toy-catalog.json';

const scripts=new Map();

function load(kind){
 const tag=`hose-${kind}`;
 if(customElements.get(tag))return Promise.resolve(tag);
 if(scripts.has(kind))return scripts.get(kind);
 const script=document.createElement('script');
 script.src=new URL(`./rubber-hose-ui/${kind}.js`,document.baseURI).href;
 const request=new Promise((resolve,reject)=>{
  script.onload=()=>customElements.get(tag)?resolve(tag):reject(new Error('玩具组件未注册'));
  script.onerror=()=>reject(new Error('玩具加载失败'));
  document.head.append(script);
 }).catch(error=>{scripts.delete(kind);script.remove();throw error;});
 scripts.set(kind,request);
 return request;
}

export function ToyArtwork({kind}){
 const [loaded,setLoaded]=useState(null);
 const item=catalog.find(item=>item.id===kind);
 useEffect(()=>{
  if(!item)return;
  let active=true;
  load(item.id).then(tag=>{if(active)setLoaded({kind:item.id,tag});},
    ()=>{if(active)setLoaded({kind:item.id,error:true});});
  return ()=>{active=false;};
 },[item]);
 if(!item||loaded?.kind!==kind)return <span className="toy-art-status" role="status">
  <SpinnerGap size={20} className="spin" aria-hidden="true"/><span className="sr-only">正在加载玩具</span>
 </span>;
 if(loaded.error)return <span className="toy-art-status" role="alert" title="玩具加载失败">
  <WarningCircle size={20} aria-hidden="true"/><span className="sr-only">玩具加载失败</span>
 </span>;
 return createElement(loaded.tag,{className:'toy-artwork',label:item.name},item.name);
}
