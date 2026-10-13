import {ImageSquare,Images} from '@phosphor-icons/react';
import {TooltipButton} from './TooltipButton.jsx';

// Future tools join this registry; they do not change the image workspace.
const tools=[
 {id:'compress',label:'压缩调整',icon:ImageSquare,enabled:true},
 {id:'stitch',label:'图像拼接',icon:Images,enabled:true}
];
export function ToolNavigation({selected='compress',onSelect}){
 return <nav className="tool-nav" aria-label="图像工具">{tools.map(({id,label,hint,icon:Icon,enabled})=><TooltipButton key={id} label={label} hint={hint} unavailable={!enabled} className={`tool-button ${id===selected?'selected':''}`} aria-current={id===selected?'page':undefined} onClick={()=>onSelect?.(id)}><Icon size={30} weight="bold" aria-hidden/></TooltipButton>)}</nav>;
}
