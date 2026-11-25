import {ImageEditIcon,CompressionIcon} from './ToolIcons.jsx';
import {TooltipButton} from './TooltipButton.jsx';
import {ToyControls} from './toys/ToyControls.jsx';

// Future tools join this registry; they do not change the image workspace.
const tools=[
 {id:'stitch',label:'图像编辑',icon:ImageEditIcon,enabled:true},
 {id:'compress',label:'压缩调整',icon:CompressionIcon,enabled:true}
];
export function ToolNavigation({selected='stitch',onSelect}){
 return <nav className="tool-nav" aria-label="图像工具">
  {tools.map(({id,label,hint,icon:Icon,enabled})=><TooltipButton key={id} label={label} hint={hint} unavailable={!enabled} className={`tool-button ${id===selected?'selected':''}`} aria-current={id===selected?'page':undefined} onClick={()=>onSelect?.(id)}><Icon/></TooltipButton>)}
  <ToyControls/>
 </nav>;
}
