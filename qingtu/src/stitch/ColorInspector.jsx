import {lazy,Suspense,useEffect,useId,useState} from 'react';
import {ArrowCounterClockwise, Plus, SpinnerGap} from '@phosphor-icons/react';
import {colorControls} from '../../engine/image-color.mjs';
import {Dropdown} from '../Dropdown.jsx';
import {ColorSlider} from './ColorSlider.jsx';
import {ColorReferenceDialog, ColorReferenceThumbnail} from './ColorReferenceDialog.jsx';

const tabs=[{key:'basic',label:'基础'},{key:'hsl',label:'HSL'},{key:'curves',label:'曲线'},{key:'wheels',label:'色轮'}];
const basicGroups=['色彩','明度','效果'];
const AdvancedColorPanel=lazy(()=>import('./AdvancedColorPanel.jsx'));

export function ColorInspector({images, selected, draft, onDraft, onCommit, onCancel,
  onChange, onMatch, matching, matchMessage, disabled, reference, onReference, onImportReference, picker}) {
  const [targetIds, setTargetIds] = useState(null);
  const [matchLuminance, setMatchLuminance] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [tab,setTab]=useState('basic'),tabId=useId();
  useEffect(() => setTargetIds(null), [reference?.id]);

  function switchTab(key){
    setTab(key);
    if(key!=='hsl')picker.close();
  }

  const current = images.find(image => image.id === selected);
  const chosen = images.filter(image => (targetIds || [selected]).includes(image.id)).map(image => image.id);
  const matchTargets = chosen.filter(id => id !== reference?.id);
  const syncTargets = chosen.filter(id => id !== selected);
  const color = draft?.id === selected ? draft.color : current?.color;
  const match = color?.match;
  const activeMatch = matchTargets.includes(selected) ? match : undefined;
  const luminance = activeMatch?.luminance ?? matchLuminance;
  const hasAdjustments = Object.values(color?.adjustments || {}).some(Boolean);

  function syncColors() {
    onChange(new Map(images.filter(image => syncTargets.includes(image.id)).map(image =>
      [image.id, {...image.color, adjustments: color.adjustments}])));
  }

  function draftColor(update){onDraft(selected,{...color,...update});}
  function resetColor(key){onChange(new Map([[selected,{...color,[key]:undefined,...(key==='hsl'&&{hslSamples:undefined})}]]));}

  return <div className="settings-scroll color-settings">
    <div className="color-panel-tabs" role="tablist" aria-label="调色类型" onKeyDown={event=>{
      const available=tabs;
      const index=available.findIndex(item=>item.key===tab),next={ArrowRight:(index+1)%available.length,
        ArrowLeft:(index+available.length-1)%available.length,Home:0,End:available.length-1}[event.key];
      if(next===undefined)return;
      event.preventDefault();switchTab(available[next].key);document.getElementById(`${tabId}-${available[next].key}`)?.focus();
    }}>
      {tabs.map(({key,label})=><button key={key} id={`${tabId}-${key}`} type="button" role="tab" aria-selected={key===tab}
        aria-controls={`${tabId}-panel-${key}`} tabIndex={key===tab?0:-1} onClick={()=>switchTab(key)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${tabId}-panel-${tab}`} aria-labelledby={`${tabId}-${tab}`}>
    {tab==='basic'?<>
    <section className="control-section color-section" aria-label="色彩克隆">
      <div className="color-section-heading">
        <h2>色彩克隆</h2>
        <button type="button" className="color-reset" disabled={disabled || !match}
          aria-label="重置色彩克隆" title="重置当前图片的色彩克隆"
          onClick={() => {setMatchLuminance(false);resetColor('match');}}>
          <ArrowCounterClockwise size={14} aria-hidden="true"/>重置
        </button>
      </div>
      <div className="color-field"><label htmlFor={`${tabId}-reference`}>参考图片</label>
      <button type="button" id={`${tabId}-reference`} className="color-reference-trigger" disabled={disabled}
        aria-haspopup="dialog" aria-label={reference ? '更换参考图' : '添加参考图'} onClick={() => setChoosing(true)}>
        {reference&&<ColorReferenceThumbnail image={reference}/>}
        <span className="color-reference-trigger-name" title={reference?.name}>{reference?.name || '添加参考图'}</span>
        <Plus size={18} aria-hidden="true"/>
      </button></div>
      {choosing&&<ColorReferenceDialog images={images} reference={reference} onSelect={onReference} onImport={onImportReference} onClose={() => setChoosing(false)}/>}
      {reference&&<>
        <div className="color-field"><label htmlFor={`${tabId}-targets`}>处理图片</label>
        <Dropdown id={`${tabId}-targets`} label="处理图片" className="color-target-picker" multiple value={matchTargets} onChange={setTargetIds}
          triggerText={matchTargets.length?`已选 ${matchTargets.length} 张`:'未选择图片'} maxHeight={250} minMenuWidth={252}
          disabled={disabled || !images.some(image => image.id !== reference.id)}
          options={images.flatMap((image,index) => image.id===reference.id ? [] : [{value:image.id,label:`${index+1} · ${image.name}`}])}/></div>
        <label className="color-check">
          同时匹配明暗
          <input type="checkbox" role="switch" checked={luminance} disabled={disabled} onChange={event => {
            const checked = event.target.checked;
            setMatchLuminance(checked);
            if (activeMatch) onChange(new Map([[selected, {...color, match: {...match, luminance: checked}}]]));
          }}/>
        </label>
        <button type="button" className="primary color-match-button" disabled={disabled || !matchTargets.length}
          onClick={() => onMatch(matchTargets, {luminance, strength: activeMatch?.strength ?? 70})}>
          {matching&&<SpinnerGap className="spin" size={15} aria-hidden="true"/>}
          {matching ? '正在克隆…' : '克隆色彩'}
        </button>
      </>}
      {match&&<ColorSlider key={selected} label="克隆强度" min={0} max={100} value={match.strength} suffix="%" disabled={disabled}
        onChange={strength => onDraft(selected, {...color, match: {...match, strength}})}
        onCommit={onCommit} onCancel={onCancel}/>}
      {matchMessage&&<p className={'color-hint' + (matchMessage.error ? ' color-error' : '')} role={matchMessage.error ? 'alert' : 'status'}>{matchMessage.text}</p>}
    </section>
    <section className="control-section color-section" aria-label="基础调色">
      <div className="color-section-heading">
        <h2>基础调色</h2>
        <button type="button" className="color-reset" disabled={disabled || !hasAdjustments}
          aria-label="重置基础调色" title="重置当前图片的基础调色"
          onClick={() => resetColor('adjustments')}>
          <ArrowCounterClockwise size={14} aria-hidden="true"/>重置
        </button>
      </div>
      {basicGroups.map(group=><div key={group} className="color-control-group" role="group" aria-label={group}>
        <h3>{group}</h3>
        {colorControls.filter(control=>control.group===group).map(({key,label,max,min=-max,step})=><ColorSlider
          key={selected+':'+key} label={label} value={color?.adjustments?.[key]||0} min={min} max={max} step={step}
          disabled={disabled||!current} track={key}
          onChange={value=>draftColor({adjustments:{...color?.adjustments,[key]:value}})} onCommit={onCommit} onCancel={onCancel}/>)}
      </div>)}
      {syncTargets.length > 0&&<button type="button" className="color-sync-button"
        disabled={disabled || !hasAdjustments} onClick={syncColors}>同步基础调色到 {syncTargets.length} 张</button>}
    </section>
    </>:<Suspense fallback={<p className="color-hint" role="status">正在加载调色工具…</p>}>
      <AdvancedColorPanel key={tab+':'+selected} tab={tab} color={color} picker={picker} disabled={disabled||!current}
        onDraft={draftColor} onCommit={onCommit} onCancel={onCancel} onReset={()=>resetColor(tab)}/>
    </Suspense>}
    </div>
  </div>;
}
