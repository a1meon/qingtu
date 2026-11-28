import {Check,WarningCircle,ArrowRight} from '@phosphor-icons/react';
import {Dropdown} from './Dropdown.jsx';
import {SPEC_PRESETS,FIT_MODES,MB,checkAsset,ratioOk,fixesSpec} from '../engine/spec.mjs';
import {MAX_EDGE} from '../engine/canvas-limits.mjs';

const CUSTOM_FIELDS=[
 {key:'minSide',label:'最短边',unit:'px',min:1,max:MAX_EDGE,step:1},
 {key:'maxSide',label:'最长边',unit:'px',min:1,max:MAX_EDGE,step:1},
 {key:'ratioMin',label:'比例下限',unit:'',min:0.05,max:20,step:0.1},
 {key:'ratioMax',label:'比例上限',unit:'',min:0.05,max:20,step:0.1},
 {key:'maxBytes',label:'单张上限',unit:'MB',min:1,max:100,step:1,scale:MB},
 {key:'maxCount',label:'单次张数',unit:'张',min:1,max:100,step:1}
];

// Platform preset, per-rule check of the selected image (original → export),
// and whether exports are fixed or only reported.
export function SpecPanel({specId,onSpec,spec,custom,onCustom,fit,onFit,origin,result,processing,disabled}){
 const before=origin&&spec?checkAsset(spec,origin):[];
 const after=result&&spec?checkAsset(spec,result):[];
 const placeholder=spec?checkAsset(spec,{width:1,height:1,bytes:0,format:''}):[];
 const needsReframe=!!(origin&&spec&&!ratioOk(spec,origin.width,origin.height));
 const show=field=>{const v=custom[field.key];return v===''?'':Math.round(v/(field.scale||1)*100)/100;};
 const edit=(field,raw)=>onCustom(old=>({...old,[field.key]:raw===''?'':Number(raw)*(field.scale||1)}));
 const settle=field=>{const v=Number(custom[field.key]);if(custom[field.key]===''||!Number.isFinite(v)||v<=0)onCustom(old=>({...old,[field.key]:field.min*(field.scale||1)}));};
 return <div className="control-section spec-section">
  <label htmlFor="spec">参考规格</label>
  <Dropdown id="spec" label="参考素材规格" value={specId} onChange={onSpec} disabled={disabled} options={SPEC_PRESETS.map(p=>({value:p.id,label:p.label,description:p.short}))}/>
  {specId==='custom'&&<div className="spec-custom">
   {CUSTOM_FIELDS.map(field=><label className="spec-custom-field" key={field.key}>
    <span>{field.label}</span>
    <span className="number-with-unit"><input type="number" min={field.min} max={field.max} step={field.step} aria-label={field.label} disabled={disabled} value={show(field)} onChange={e=>edit(field,e.target.value)} onBlur={()=>settle(field)}/>{field.unit&&<span>{field.unit}</span>}</span>
   </label>)}
  </div>}
  {spec&&<div className="spec-checks" role="table" aria-label="规格检查">
   {(before.length?before:placeholder).map((row,i)=>{
    const out=after[i];
    // Report-only exports are allowed to fail a rule: that is a warning, not an error.
    const state=!origin?'idle':out?(out.ok?'ok':fixesSpec(fit)?'bad':'warn'):row.ok?'ok':processing?'pending':'warn';
    return <div className={`spec-row ${state}`} role="row" key={row.id}>
     <span className="spec-label" role="cell">{row.label}</span>
     <span className="spec-value" role="cell">{!origin?<span className="spec-rule">{row.rule}</span>:<>
      <span className={row.ok?'':'spec-bad-value'}>{row.value}</span>
      {out&&out.value!==row.value&&<><ArrowRight size={11} className="spec-arrow" aria-hidden/><span>{out.value}</span></>}
     </>}</span>
     <span className="spec-icon" role="cell" title={row.rule} key={state}>{state==='ok'?<Check size={12} weight="bold" aria-label="符合"/>:state==='bad'||state==='warn'?<WarningCircle size={14} weight="bold" aria-label="不符合"/>:state==='pending'?<span className="spec-dot"/>:null}</span>
    </div>;
   })}
  </div>}
  {spec&&<div className={`spec-fit ${needsReframe?'active':''}`}>
   <label htmlFor="spec-fit">不合规时</label>
   <Dropdown id="spec-fit" label="不合规时的处理方式" value={fit} onChange={onFit} disabled={disabled} options={FIT_MODES}/>
  </div>}
 </div>;
}
