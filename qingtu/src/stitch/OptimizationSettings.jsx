import {useEffect,useRef,useState} from 'react';
import {Question} from '@phosphor-icons/react';
import {TooltipButton} from '../TooltipButton.jsx';
import {DEFAULT_OPTIMIZATION_SETTINGS,optimizationSettings,optimizationImageCrops} from '../../engine/optimization-settings.mjs';

const draftCrop=crop=>({enabled:crop.enabled,topPercent:String(crop.topPercent),sidePixels:String(crop.sidePixels)});
export function OptimizationSettings({value,onChange,onValidityChange,hint,images}){
 const [draft,setDraft]=useState(()=>Object.fromEntries(Object.entries(optimizationImageCrops(value,images)).map(([id,crop])=>[id,draftCrop(crop)]))),[error,setError]=useState('');
 const latest=useRef(draft);
 useEffect(()=>{onValidityChange('');},[]);
 function parsed(crop,id,number){
  try{
   if([crop.topPercent,crop.sidePixels].some(value=>value.trim()===''))throw new Error('请输入裁剪数值');
   return optimizationSettings({specialCrops:{[id]:{enabled:crop.enabled,topPercent:Number(crop.topPercent),sidePixels:Number(crop.sidePixels)}}}).specialCrops[id];
  }catch(e){throw new Error(`第 ${number} 张：${e.message}`);}
 }
 function save(next){
  latest.current=next;setDraft(next);
  try{
   const crops=Object.fromEntries(images.flatMap((image,index)=>Object.hasOwn(next,image.id)?[[image.id,parsed(next[image.id],image.id,index+1)]]:[]));
   const settings=optimizationSettings({...optimizationSettings(value),specialCrops:crops});setError('');onValidityChange('');
   onChange(settings).catch(e=>{if(latest.current===next){setError(e.message);onValidityChange(e.message);}});
  }catch(e){setError(e.message);onValidityChange(e.message);}
 }
 function toggle(image,index){
  const previous=Object.hasOwn(latest.current,image.id)?latest.current[image.id]:draftCrop({...DEFAULT_OPTIMIZATION_SETTINGS,enabled:false});let crop={...previous,enabled:!previous.enabled};
  if(!crop.enabled)try{parsed(crop,image.id,index+1);}catch{const saved=optimizationImageCrops(value,images);crop=draftCrop({...(Object.hasOwn(saved,image.id)?saved[image.id]:DEFAULT_OPTIMIZATION_SETTINGS),enabled:false});}
  save({...latest.current,[image.id]:crop});
 }
 function change(id,key,raw){save({...latest.current,[id]:{...latest.current[id],[key]:raw}});}
 return <section className="optimization-settings" aria-label="优化裁剪设置">
  <div className="optimization-settings-heading"><h3>特殊裁剪</h3>
   <TooltipButton type="button" label="如何使用四视优化" className="optimization-help" hint={<ul className="optimization-help-list">
    <li>四视优化会裁去角色四视图中正面全身照的头部，并把整排图的宽高比控制在 2.4:1 以内。</li>
    <li>如果共有 3 张图，特殊裁剪默认选择第 2 张，适合正、侧面部近景合在一张图的情况（建议将四个视图分开导入，或将正、侧面部特写裁为 2 张图）。</li>
    <li>如果共有 4 张图，特殊裁剪默认选择第 3 张。</li>
    <li>点选正面全身照的编号，设置「顶部」和「左右各」的裁剪量，再点「四视优化」应用。</li>
    <li>裁完正面全身照后，如果整排宽高比仍超过 2.4:1，其余图片会按相同比例裁去左右两侧。</li>
   </ul>}><Question size={17} aria-hidden/></TooltipButton>
  </div>
  <div className="optimization-settings-body">
  {images.length>0&&<div className="optimization-image-buttons" role="group" aria-label="特殊裁剪图片">{images.map((image,index)=><button type="button" key={image.id} aria-label={`第 ${index+1} 张特殊裁剪`} aria-pressed={!!draft[image.id]?.enabled} title={image.name} onClick={()=>toggle(image,index)}>{index+1}</button>)}</div>}
  {images.map((image,index)=>draft[image.id]?.enabled&&<section className="optimization-image-crop" key={image.id} aria-label={`第 ${index+1} 张裁剪参数`} data-image-id={image.id}>
   <h4>第 {index+1} 张</h4>
   <label className="optimization-setting-row"><span>顶部</span><div className="number-with-unit"><input aria-label={`第 ${index+1} 张优化顶部裁剪比例`} type="number" min="0" max="99.9" step="0.1" value={draft[image.id].topPercent} onFocus={event=>event.target.select()} onChange={event=>change(image.id,'topPercent',event.target.value)}/><span>%</span></div></label>
   <label className="optimization-setting-row"><span>左右各</span><div className="number-with-unit"><input aria-label={`第 ${index+1} 张优化左右裁剪像素`} type="number" min="0" step="1" value={draft[image.id].sidePixels} onFocus={event=>event.target.select()} onChange={event=>change(image.id,'sidePixels',event.target.value)}/><span>px</span></div></label>
  </section>)}
  {error?<p className="split-error" role="alert">{error}</p>:<p className="optimization-setting-hint">{hint||'点击四视优化应用'}</p>}
  </div>
 </section>;
}
