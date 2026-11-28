import {useState} from 'react';
import {Desktop,Sun,Moon} from '@phosphor-icons/react';
import {TooltipButton} from './TooltipButton.jsx';
import {applyTheme,storedTheme} from './theme.js';

const order=['system','light','dark'];
const meta={
 system:{label:'跟随系统',icon:Desktop},
 light:{label:'浅色',icon:Sun},
 dark:{label:'深色',icon:Moon}
};
// One rail button cycles 跟随系统 → 浅色 → 深色; the tooltip names the
// current appearance and the one a click switches to.
export function ThemeButton(){
 const [theme,setTheme]=useState(storedTheme);
 const next=order[(order.indexOf(theme)+1)%order.length];
 const {label,icon:Icon}=meta[theme];
 function cycle(){setTheme(next);applyTheme(next,{animate:true});}
 return <TooltipButton label={`外观：${label}`} hint={`外观：${label} · 点击切换为${meta[next].label}`} className="tool-button theme-button" onClick={cycle}>
  <Icon key={theme} size={21} aria-hidden className="theme-button-icon"/>
 </TooltipButton>;
}
