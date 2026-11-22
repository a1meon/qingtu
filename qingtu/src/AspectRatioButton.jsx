import {LinkSimple,LinkSimpleBreak} from '@phosphor-icons/react';

export function AspectRatioButton({locked,onClick,disabled,subject=''}){
 const label=`${locked?'解锁':'锁定'}${subject}宽高比例`,Icon=locked?LinkSimple:LinkSimpleBreak;
 return <button type="button" className="link-button" disabled={disabled} aria-label={label} title={label}
  aria-pressed={locked} onClick={onClick}><Icon size={25} weight="bold" aria-hidden/></button>;
}
