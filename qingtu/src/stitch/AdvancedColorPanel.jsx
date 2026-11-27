import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowCounterClockwise,Eyedropper,Minus} from '@phosphor-icons/react';
import {curveChannels,curveTable,hslBands,hslControls,hslSampleKey,neutralCurve,wheelRanges} from '../../engine/advanced-color.mjs';
import {ColorSlider} from './ColorSlider.jsx';

const labels={hsl:'HSL',curves:'曲线',wheels:'色轮'};
const channelOptions=curveChannels.map((key,i)=>({key,label:['RGB','红','绿','蓝'][i]}));
const curveColors={rgb:'#218ee7',red:'#e73455',green:'#25995d',blue:'#4268e3'};
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function Segments({label,items,value,select,disabled}){
  return <div className="color-segments" role="group" aria-label={label}>
    {items.map(item=><button key={item.key} type="button" disabled={disabled} aria-pressed={value===item.key}
      onClick={()=>select(item.key)}>{item.label}</button>)}
  </div>;
}

function HslPanel({color,disabled,onDraft,onCommit,onCancel,picker}){
  const [key,setKey]=useState(picker?.sample?.key||'red');
  useEffect(()=>{if(picker?.sample?.key)setKey(picker.sample.key);},[picker?.sample]);
  const samples=color?.hslSamples||[];
  const sampleIndex=samples.findIndex(sample=>hslSampleKey(sample.rgb)===key);
  const sample=samples[sampleIndex],band=hslBands.find(item=>item.key===key)||hslBands[0];
  const active=sample?key:band.key,values=sample?.adjustment||(!sample&&color?.hsl?.[band.key])||{};
  const update=(control,value)=>{
    const adjustment={...values,[control]:value};
    if(sample)onDraft({hslSamples:samples.map((item,i)=>i===sampleIndex?{...item,adjustment}:item)});
    else onDraft({hsl:{...color?.hsl,[band.key]:adjustment}});
  };
  return <>
    <div className="hsl-palette">
      <button type="button" className="hsl-picker" aria-label="画布取色" title="画布取色" aria-pressed={picker?.active||false}
        disabled={disabled} onClick={picker?.toggle}><Eyedropper size={16} aria-hidden="true"/></button>
      <div className="hsl-swatches" role="group" aria-label="颜色范围">
      {samples.map(({rgb})=>{
        const swatch=hslSampleKey(rgb),label=`#${swatch.toUpperCase()}`;
        return <button key={swatch} type="button" title={label} aria-label={label} data-picked-color={label}
          disabled={disabled} aria-pressed={swatch===active} style={{'--swatch':label}} onClick={()=>setKey(swatch)}/>;
      })}
      {hslBands.map(({key,label,hue})=><button key={key} type="button" title={label} aria-label={label}
        disabled={disabled} aria-pressed={key===active} style={{'--swatch':`hsl(${hue} 82% 54%)`}} onClick={()=>setKey(key)}/>)}
      </div>
    </div>
    <span className="color-range-label">{sample?`#${key.toUpperCase()}`:`${band.label}色`}</span>
    {hslControls.map(({key:control,label,max})=><ColorSlider key={`${active}:${control}`} label={label} min={-max} max={max}
      value={values[control]||0} suffix={control==='hue'?'°':''} disabled={disabled} track={`hsl-${control}`}
      onChange={value=>update(control,value)} onCommit={onCommit} onCancel={onCancel}/>)}
  </>;
}

function CurvePanel({color,disabled,onDraft,onCommit,onCancel}){
  const [channel,setChannel]=useState('rgb'),[active,setActive]=useState(0),drag=useRef(null);
  const points=color?.curves?.[channel]||neutralCurve,index=Math.min(active,points.length-1);
  const path=useMemo(()=>Array.from(curveTable(points),(value,x)=>`${x?'L':'M'}${x},${255-value}`).join(''),[points]);
  const publish=next=>onDraft({curves:{...color?.curves,[channel]:next}});
  const sample=event=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    return [Math.round(clamp((event.clientX-bounds.left)*255/bounds.width,0,255)),
      Math.round(clamp(255-(event.clientY-bounds.top)*255/bounds.height,0,255))];
  };
  function movePoint(base,i,x,y){
    const constrained=i===0?0:i===base.length-1?255:clamp(x,base[i-1][0]+1,base[i+1][0]-1);
    return base.map((point,n)=>n===i?[constrained,clamp(y,0,255)]:point);
  }
  function begin(event){
    if(disabled||event.button!==0)return;
    event.preventDefault();
    const [x,y]=sample(event);
    const byX=points.findIndex(point=>Math.abs(point[0]-x)<4);
    let i=points.findIndex(point=>Math.hypot(point[0]-x,point[1]-y)<12),base=points;
    if(i<0)i=byX;
    if(i<0){
      if(points.length>=12)return;
      i=points.findIndex(point=>point[0]>x);
      base=[...points.slice(0,i),[x,y],...points.slice(i)];
    }
    event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,i,base};setActive(i);publish(movePoint(base,i,x,y));
  }
  function move(event){
    const value=drag.current;
    if(value?.id===event.pointerId)publish(movePoint(value.base,value.i,...sample(event)));
  }
  function finish(event,cancelled=false){
    if(drag.current?.id!==event.pointerId)return;
    if(!cancelled)move(event);
    drag.current=null;
    if(cancelled)onCancel();else onCommit();
  }
  function remove(i=index){
    if(disabled||i<1||i>=points.length-1)return;
    publish(points.filter((_,n)=>n!==i));setActive(i-1);onCommit();
  }
  function keys(event){
    if(disabled)return;
    const step=event.shiftKey?8:1,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[event.key];
    if(delta){event.preventDefault();publish(movePoint(points,index,points[index][0]+delta[0],points[index][1]+delta[1]));onCommit();}
    if(event.key==='PageUp'||event.key==='PageDown'){event.preventDefault();setActive(clamp(index+(event.key==='PageUp'?-1:1),0,points.length-1));}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove();}
  }
  return <>
    <Segments label="曲线通道" items={channelOptions} value={channel} disabled={disabled} select={value=>{setChannel(value);setActive(0);}}/>
    <div className="color-curve-frame" style={{'--curve-color':curveColors[channel]}}>
      <svg className="color-curve" viewBox="0 0 255 255" role="group" tabIndex={disabled?-1:0} aria-label="曲线控制点，方向键移动，翻页键选择"
        onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={event=>finish(event,true)}
        onLostPointerCapture={event=>finish(event,true)} onKeyDown={keys}>
        {[64,128,191].map(tick=><path key={tick} className="color-curve-grid" d={`M${tick},0 V255 M0,${tick} H255`}/>)}
        <path className="color-curve-neutral" d="M0,255 L255,0"/>
        <path className="color-curve-path" d={path}/>
        {points.map(([x,y],i)=><circle key={x} cx={x} cy={255-y} r={index===i?5.5:4}
          className={index===i?'active':''} onContextMenu={event=>{event.preventDefault();remove(i);}}/>)}
      </svg>
    </div>
    <div className="color-curve-footer"><span>输入 {points[index][0]}　输出 {points[index][1]}</span>
      <button type="button" className="color-reset" disabled={disabled||index===0||index===points.length-1} onClick={()=>remove()}><Minus size={13}/>删除点</button>
    </div>
  </>;
}

function constrainWheel(x,y){
  const amount=Math.max(1,Math.hypot(x,y)/100);
  return {x:Math.trunc(x/amount),y:Math.trunc(y/amount)};
}

function WheelPanel({color,disabled,onDraft,onCommit,onCancel}){
  const [range,setRange]=useState('midtones'),pointer=useRef(null);
  const value=color?.wheels?.[range]||{},x=value.x||0,y=value.y||0;
  const update=change=>onDraft({wheels:{...color?.wheels,[range]:{...value,...change}}});
  function move(event){
    if(pointer.current!==event.pointerId)return;
    const bounds=event.currentTarget.getBoundingClientRect(),radius=bounds.width/2;
    update(constrainWheel((event.clientX-bounds.left-radius)*100/radius,(event.clientY-bounds.top-radius)*100/radius));
  }
  function finish(event,cancelled=false){
    if(pointer.current!==event.pointerId)return;
    if(!cancelled)move(event);
    pointer.current=null;
    if(cancelled)onCancel();else onCommit();
  }
  return <>
    <Segments label="色轮范围" items={wheelRanges} value={range} select={setRange} disabled={disabled}/>
    <button type="button" className="color-wheel" aria-label={`${wheelRanges.find(item=>item.key===range).label}色轮`} disabled={disabled}
      style={{'--wheel-x':`${50+x/2}%`,'--wheel-y':`${50+y/2}%`}}
      onPointerDown={event=>{if(event.button!==0)return;pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);move(event);}}
      onPointerMove={move} onPointerUp={finish} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
      onKeyDown={event=>{
        const step=event.shiftKey?8:2,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
        if(delta){event.preventDefault();update(constrainWheel(x+delta[0],y+delta[1]));onCommit();}
        if(event.key==='Home'){event.preventDefault();update({x:0,y:0});onCommit();}
      }}><span aria-hidden="true"/></button>
    <ColorSlider key={range} label="色轮明度" min={-100} max={100} value={value.lightness||0} disabled={disabled}
      onChange={lightness=>update({lightness})} onCommit={onCommit} onCancel={onCancel}/>
  </>;
}

const panels={hsl:HslPanel,curves:CurvePanel,wheels:WheelPanel};
export default function AdvancedColorPanel({tab,color,disabled,onReset,...editing}){
  const Panel=panels[tab],label=labels[tab];
  return <section className="control-section color-section" aria-label={label}>
    <div className="color-section-heading"><h2>{label}</h2>
      <button className="color-reset" type="button" aria-label={`重置${label}`} disabled={disabled||!color?.[tab]&&!(tab==='hsl'&&color?.hslSamples?.length)} onClick={onReset}>
        <ArrowCounterClockwise size={14} aria-hidden="true"/>重置
      </button>
    </div>
    <Panel {...editing} color={color} disabled={disabled}/>
  </section>;
}
