import {useEffect,useId,useState} from 'react';
import {ArrowCounterClockwise,ArrowUUpLeft,ArrowUUpRight} from '@phosphor-icons/react';
import {hasLimitedLegRoom,portraitPoint} from '../../engine/portrait-retouch.mjs';
import {ColorSlider} from './ColorSlider.jsx';

export function PortraitPanel({portrait,value,disabled,onDraft,onCommit,onCancel,onChange}){
  const {face,body,legs,head,mode,size,canRedo}=portrait;
  const [preference,setPreference]=useState(null),id=useId();
  // 美颜 works from the face landmarks (portraits and close-ups); 美体 from
  // the figure. Each has its own small-head algorithm.
  const tabs=[
    {key:'face',label:'美颜',available:!!face,reason:portrait.faceStatus},
    {key:'body',label:'美体',available:!!body,reason:portrait.bodyStatus},
    {key:'manual',label:'手动调整',available:portrait.selected},
  ];
  const tab=(tabs.find(item=>item.key===preference&&item.available)||tabs.find(item=>item.available))?.key;
  const strokes=value?.strokes||[];
  const slider={disabled,onCommit,onCancel,min:0,max:100,suffix:'%'};
  const turn=value?.turn||0,mirrored=!!value?.mirrored;
  function retouchBox(box){
    if(!box)return box;
    const toSource=point=>portraitPoint(point,mirrored?turn:(360-turn)%360,mirrored);
    const center=toSource(box);
    // The turn (nose offset) is horizontal on screen; it maps to the source
    // only without a quarter turn, flipping with a mirror or half turn.
    const lean=box.lean&&!(turn%180)?box.lean*((mirrored?-1:1)*(turn===180?-1:1)):undefined;
    return {...center,rx:turn%180?box.ry:box.rx,ry:turn%180?box.rx:box.ry,
      ...(box.oval&&{oval:box.oval.map(toSource)}),...(lean&&{lean})};
  }
  const retouchLegs=turn&&value.legs||(!turn&&mirrored&&legs?{...legs,x:1-legs.x}:legs)||value?.legs;
  function choose(key){setPreference(key);if(key!=='manual')portrait.close();}
  // 手动调整 is a push brush: it is ready as soon as the tab is open.
  const brushReady=tab==='manual'&&portrait.selected&&!disabled;
  useEffect(()=>{if(brushReady&&!mode)portrait.setMode('push');},[brushReady,mode]);
  return <div className="settings-scroll color-settings">
    <div className="color-panel-tabs portrait-tabs" role="tablist" aria-label="人像工具" onKeyDown={event=>{
      const choices=tabs.filter(item=>item.available&&!disabled);
      const index=choices.findIndex(item=>item.key===tab);
      const next={ArrowRight:index+1,ArrowLeft:index-1,Home:0,End:choices.length-1}[event.key];
      if(next===undefined||!choices.length)return;
      event.preventDefault();
      const key=choices[(next+choices.length)%choices.length].key;
      choose(key);document.getElementById(id+key)?.focus();
    }}>
      {tabs.map(({key,label,available,reason})=><button key={key} id={id+key} type="button" role="tab"
        aria-controls={key===tab?id+'panel':undefined} aria-selected={key===tab} tabIndex={key===tab?0:-1}
        aria-label={label}
        disabled={disabled||!available} title={!available?reason:undefined} onClick={()=>choose(key)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={id+'panel'} aria-labelledby={tab?id+tab:undefined}>
    {portrait.selected&&<p className={`portrait-status ${portrait.detecting?'busy':''}`} role="status">{portrait.summary}</p>}
    {tab==='face'&&<>
    <section className="control-section color-section" aria-label="面部">
      <div className="color-section-heading"><h2>面部</h2>
        <button type="button" className="portrait-icon" aria-label="重置面部" title="重置面部" disabled={disabled||!value?.slim&&!value?.skin}
          onClick={()=>onChange({...value,slim:0,skin:0})}><ArrowCounterClockwise size={16}/></button>
      </div>
      <ColorSlider label="瘦脸" value={value?.slim||0} onChange={slim=>onDraft({...value,face:face?retouchBox(face):value?.face,slim})} {...slider} disabled={disabled||!face}/>
      <ColorSlider label="磨皮" value={value?.skin||0} onChange={skin=>onDraft({...value,face:face?retouchBox(face):value?.face,skin})} {...slider} disabled={disabled||!face}/>
      {!face&&<p className="color-hint">美颜需要看得到正脸或侧脸。</p>}
    </section>
    <section className="control-section color-section" aria-label="头部">
      <div className="color-section-heading"><h2>头部</h2>
        <button type="button" className="portrait-icon" aria-label="重置美颜小头" title="重置小头" disabled={disabled||!value?.faceSize}
          onClick={()=>onChange({...value,faceSize:0})}><ArrowCounterClockwise size={16}/></button>
      </div>
      <ColorSlider label="小头" value={value?.faceSize||0} onChange={faceSize=>onDraft({...value,face:face?retouchBox(face):value?.face,faceSize})}
        {...slider} disabled={disabled||!face}/>
    </section>
    </>}
    {tab==='body'&&<>
    <section className="control-section color-section" aria-label="身形">
      <div className="color-section-heading"><h2>身形</h2>
        <button type="button" className="portrait-icon" aria-label="重置美体" title="重置美体" disabled={disabled||!value?.length&&!value?.headSize}
          onClick={()=>onChange({...value,length:0,headSize:0})}><ArrowCounterClockwise size={16}/></button>
      </div>
      <ColorSlider label="小头" value={value?.headSize||0} onChange={headSize=>onDraft({...value,head:(turn||mirrored)&&value?.head||retouchBox(head)||value?.head,headSize})}
        {...slider} disabled={disabled||!head}/>
      <ColorSlider label="拉长腿" value={value?.length||0} onChange={length=>onDraft({...value,legs:retouchLegs,length})}
        {...slider} disabled={disabled||!legs}/>
      {!head&&<p className="color-hint">小头需要看得到头部。</p>}
      {!legs&&<p className="color-hint">拉长腿需要看得到髋部、膝盖和脚踝。</p>}
      {hasLimitedLegRoom(legs)&&<p className="color-hint">脚下留白较少，拉伸幅度受限。</p>}
    </section>
    </>}
    {tab==='manual'&&<section className="control-section color-section" aria-label="局部液化">
      <div className="color-section-heading">
        <h2>局部液化</h2>
        <div className="portrait-history" role="group" aria-label="液化历史">
          <button type="button" className="portrait-icon" disabled={disabled||!strokes.length} aria-label="撤销上一笔" title="撤销上一笔"
            onClick={portrait.undo}><ArrowUUpLeft size={16}/></button>
          <button type="button" className="portrait-icon" disabled={disabled||!canRedo} aria-label="重做下一笔" title="重做下一笔"
            onClick={portrait.redo}><ArrowUUpRight size={16}/></button>
          <button type="button" className="portrait-icon" disabled={disabled||!strokes.length&&!canRedo} aria-label="重置液化" title="重置液化"
            onClick={portrait.reset}><ArrowCounterClockwise size={16}/></button>
        </div>
      </div>
      <ColorSlider label="笔刷大小" min={6} max={180} value={size} suffix="px" disabled={disabled}
        onChange={portrait.setSize} onCommit={()=>{}} onCancel={()=>{}}/>
      <p className="color-hint">在图片上沿轮廓拖动即可推动。放大画布可精修局部。</p>
    </section>}
    {!tab&&<p className="color-hint">点击画布中的人物图片开始。</p>}
    </div>
  </div>;
}
