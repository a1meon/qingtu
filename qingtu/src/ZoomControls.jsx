import {Minus,Plus,ArrowCounterClockwise} from '@phosphor-icons/react';

export function ZoomControls({navigation,disabled=false,resetTitle="复位视图 · 适应图片"}){
 const {zoom,step,reset}=navigation;
 return <div className="canvas-viewport-controls" role="group" aria-label="显示区域操作">
  <button aria-label="缩小视图" title="缩小视图" disabled={disabled||zoom<=.1} onClick={()=>step(-1)}><Minus size={15}/></button>
  <output aria-label="视图缩放比例" title="Ctrl/Cmd + 滚轮缩放 · 空格或中键拖动平移">{Math.round(zoom*100)}%</output>
  <button aria-label="放大视图" title="放大视图" disabled={disabled||zoom>=8} onClick={()=>step(1)}><Plus size={15}/></button>
  <button aria-label="复位视图" title={resetTitle} disabled={disabled} onClick={reset}><ArrowCounterClockwise size={16}/></button>
 </div>;
}
