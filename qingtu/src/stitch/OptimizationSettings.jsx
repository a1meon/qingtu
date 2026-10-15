import {useRef,useState} from 'react';
import {optimizationSettings} from '../../engine/optimization-settings.mjs';

export function OptimizationSettings({value,onChange,onValidityChange,hint}){
 const [draft,setDraft]=useState(()=>{const settings=optimizationSettings(value);return {topPercent:String(settings.topPercent),sidePixels:String(settings.sidePixels)};}),[error,setError]=useState('');
 const latest=useRef(draft);
 function change(key,raw){
  const next={...latest.current,[key]:raw};latest.current=next;setDraft(next);
  try{
   if(Object.values(next).some(value=>value.trim()===''))throw new Error('请输入裁剪数值');
   const settings=optimizationSettings({topPercent:Number(next.topPercent),sidePixels:Number(next.sidePixels)});setError('');onValidityChange('');onChange(settings).catch(e=>{setError(e.message);});
  }catch(e){setError(e.message);onValidityChange(e.message);}
 }
 return <section className="optimization-settings" aria-label="优化裁剪设置">
  <h3>第三张裁剪</h3>
  <label className="optimization-setting-row"><span>顶部</span><div className="number-with-unit"><input aria-label="优化顶部裁剪比例" type="number" min="0" max="99.9" step="0.1" value={draft.topPercent} onFocus={event=>event.target.select()} onChange={event=>change('topPercent',event.target.value)}/><span>%</span></div></label>
  <label className="optimization-setting-row"><span>左右各</span><div className="number-with-unit"><input aria-label="优化左右裁剪像素" type="number" min="0" step="1" value={draft.sidePixels} onFocus={event=>event.target.select()} onChange={event=>change('sidePixels',event.target.value)}/><span>px</span></div></label>
  {error?<p className="split-error" role="alert">{error}</p>:<p className="optimization-setting-hint">{hint||'点击一键优化应用'}</p>}
 </section>;
}
