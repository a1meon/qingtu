import {ArrowCounterClockwise} from '@phosphor-icons/react';
import {TooltipButton} from '../TooltipButton.jsx';
import {OptimizeIcon} from './OptimizeIcon.jsx';

export function CanvasTools({project,busy,onReset,onOptimize}){
 return <div className="canvas-actions" role="group" aria-label="画布工具">
  <TooltipButton label="重置裁剪与顺序" placement="left" className="canvas-reset" disabled={busy||!project?.images.length} onClick={onReset}><ArrowCounterClockwise size={19}/></TooltipButton>
  <button className="canvas-optimize" aria-label="一键优化" title={project?.layout==='horizontal'?'统一左右裁剪为 2.5:1':'仅横排可用'} disabled={busy||!project?.images.length||project.layout!=='horizontal'} onClick={onOptimize}><span className="optimizer-glyph"><OptimizeIcon size={22}/></span><span>一键优化</span></button>
 </div>;
}
