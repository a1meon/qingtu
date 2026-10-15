import {useRef,useState} from 'react';
import {Dropdown} from '../Dropdown.jsx';
import {optimizationSettings} from '../../engine/optimization-settings.mjs';

export function OptimizationSettings({value,onChange,onValidityChange,hint,imageCount}){
 const [draft,setDraft]=useState(()=>{const settings=optimizationSettings(value);return {topPercent:String(settings.topPercent),sidePixels:String(settings.sidePixels),imageNumber:settings.imageNumber===null?'none':String(settings.imageNumber)};}),[error,setError]=useState('');
 const latest=useRef(draft);
 function change(key,raw){
  const next={...latest.current,[key]:raw};
  if(key==='imageNumber'&&raw==='none'){
   const saved=optimizationSettings(value);
   for(const field of ['topPercent','sidePixels'])try{if(next[field].trim()==='')throw new Error();optimizationSettings({...saved,[field]:Number(next[field])});}catch{next[field]=String(saved[field]);}
  }
  latest.current=next;setDraft(next);
  try{
   if(Object.values(next).some(value=>value.trim()===''))throw new Error('请输入裁剪数值');
   const settings=optimizationSettings({topPercent:Number(next.topPercent),sidePixels:Number(next.sidePixels),imageNumber:next.imageNumber==='none'?null:Number(next.imageNumber)});setError('');onValidityChange('');onChange(settings).catch(e=>{setError(e.message);});
  }catch(e){setError(e.message);onValidityChange(e.message);}
 }
 return <section className="optimization-settings" aria-label="优化裁剪设置">
  <h3>特殊裁剪</h3>
  <div className="optimization-setting-row"><span>图片</span><Dropdown id="optimization-image" label="优化裁剪图片" className="optimization-image-dropdown" maxHeight={280} value={draft.imageNumber} options={[{value:'none',label:'不选择'},...Array.from({length:Math.max(3,imageCount,Number(draft.imageNumber)||0)},(_,i)=>({value:String(i+1),label:`第 ${i+1} 张`,description:i>=imageCount?'未添加':undefined}))]} onChange={value=>change('imageNumber',value)}/></div>
  <label className="optimization-setting-row"><span>顶部</span><div className="number-with-unit"><input aria-label="优化顶部裁剪比例" disabled={draft.imageNumber==='none'} type="number" min="0" max="99.9" step="0.1" value={draft.topPercent} onFocus={event=>event.target.select()} onChange={event=>change('topPercent',event.target.value)}/><span>%</span></div></label>
  <label className="optimization-setting-row"><span>左右各</span><div className="number-with-unit"><input aria-label="优化左右裁剪像素" disabled={draft.imageNumber==='none'} type="number" min="0" step="1" value={draft.sidePixels} onFocus={event=>event.target.select()} onChange={event=>change('sidePixels',event.target.value)}/><span>px</span></div></label>
  {error?<p className="split-error" role="alert">{error}</p>:<p className="optimization-setting-hint">{hint||'点击一键优化应用'}</p>}
 </section>;
}
