import {ArrowCounterClockwise} from '@phosphor-icons/react';
import {TooltipButton} from '../TooltipButton.jsx';
import {OptimizeIcon} from './OptimizeIcon.jsx';
import {optimizationAvailability} from '../../engine/stitch-optimize.mjs';

export function CanvasTools({project,busy,onReset,onOptimize}){
 const optimization=optimizationAvailability(project);
 return <div className="canvas-actions" role="group" aria-label="画布工具">
  <TooltipButton label="重置裁剪与顺序" placement="left" className="canvas-reset" disabled={busy||!project?.images.length} onClick={onReset}><ArrowCounterClockwise size={19}/></TooltipButton>
  <button className="canvas-optimize" aria-label="一键优化" title={optimization.hint} disabled={busy||!optimization.enabled} onClick={onOptimize}><span className="optimizer-glyph"><OptimizeIcon size={22}/></span><span>一键优化</span></button>
 </div>;
}
