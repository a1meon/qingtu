import {useState} from 'react';

export function ImageSplitControls({image,value,onChange,onConfirm,disabled}){
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 const {axis,at}=value,size=axis==='x'?image.width:image.height;
 function direction(axis){onChange({axis,at:Math.floor((axis==='x'?image.width:image.height)/2)});}
 function number(raw){onChange({axis,at:Math.max(1,Math.min(size-1,Math.round(Number(raw)||1)))});}
 async function confirm(){setWorking(true);setError('');try{await onConfirm(axis,at);}catch(e){setError(e.message);setWorking(false);}}
 return <div className="image-split-controls">
  <div className="crop-direction" role="group" aria-label="拆分方向">{[['y','水平',image.height],['x','垂直',image.width]].map(([value,label,length])=><button key={value} aria-pressed={axis===value} className={axis===value?'active':''} disabled={disabled||working||length<2} onClick={()=>direction(value)}>{label}</button>)}</div>
  <p className="split-instruction">在画布图片上拖动分割线</p>
  <label htmlFor="split-at">分割位置</label><div className="number-with-unit"><input id="split-at" aria-label="分割位置" type="number" min="1" max={size-1} value={at} disabled={disabled||working||size<2} onChange={e=>number(e.target.value)}/><span>px</span></div>
  <div className="split-source-size">原图 {image.width} × {image.height}</div>
  {error&&<p className="split-error" role="alert">{error}</p>}
  <button className="split-confirm crop-done" disabled={disabled||working||size<2} onClick={confirm}>{working?'拆分中…':'确认拆分'}</button>
 </div>;
}
