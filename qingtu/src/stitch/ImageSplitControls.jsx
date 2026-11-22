import {useState} from 'react';

export function ImageSplitControls({image,value,onChange,onConfirm,onCancel,disabled}){
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 const {axis,at}=value,size=axis==='x'?image.width:image.height;
 function direction(axis){onChange({axis,at:Math.floor((axis==='x'?image.width:image.height)/2)});}
 function number(raw){onChange({axis,at:Math.max(1,Math.min(size-1,Math.round(Number(raw)||1)))});}
 async function confirm(){setWorking(true);setError('');try{await onConfirm(axis,at);}catch(e){setError(e.message);setWorking(false);}}
 return <form id="image-split-form" className="image-split-controls" onSubmit={event=>{event.preventDefault();if(!disabled&&!working&&size>=2)confirm();}}>
  <div className="crop-direction" role="group" aria-label="拆分方向">{[['y','水平',image.height],['x','垂直',image.width]].map(([value,label,length])=><button type="button" key={value} aria-pressed={axis===value} className={axis===value?'active':''} disabled={disabled||working||length<2} onClick={()=>direction(value)}>{label}</button>)}</div>
  <div className="inline-split-value"><label htmlFor="split-at">分割位置</label><div className="number-with-unit"><input id="split-at" aria-label="分割位置" type="number" min="1" max={size-1} value={at} disabled={disabled||working||size<2} onChange={e=>number(e.target.value)}/><span>px</span></div></div>
  {error&&<p className="split-error" role="alert">{error}</p>}
  <div className="inline-split-actions"><button type="button" className="split-cancel" disabled={disabled||working} onClick={onCancel}>取消</button><button type="submit" aria-keyshortcuts="Enter" className="split-confirm crop-done" disabled={disabled||working||size<2}>{working?'分割中…':'确认'}</button></div>
 </form>;
}
