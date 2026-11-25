export function PreviewViewSwitch({view,onChange,disabled,label='预览方式',className=''}){
 const next=view==='processed'?'original':'processed';
 const action=next==='original'?'查看原图':'查看处理后图片';
 return <div className={`view-switch preview-view-switch ${className}`} role="group" aria-label={label}>
  <button type="button" className={`preview-single-view${disabled||view==='compare'?'':' active'}`} disabled={disabled}
   aria-label={action} title={action} onClick={()=>onChange(next)}>
   <span key={view==='original'?'original':'processed'}>{view==='original'?'原图':'处理后'}</span>
  </button>
  <button type="button" className={!disabled&&view==='compare'?'active':''} disabled={disabled}
   aria-label="对比原图与结果" aria-pressed={view==='compare'} onClick={()=>onChange('compare')}><span>对比</span></button>
 </div>;
}
