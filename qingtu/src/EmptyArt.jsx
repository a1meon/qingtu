// Empty-state artwork: two stacked frames with a landscape and a blue sun.
// Every colour comes from theme tokens (see .empty-art rules in styles.css),
// so the drawing follows light and dark themes without separate assets.
import {useId} from 'react';

export function EmptyArt({className=''}){
 const clip=useId().replace(/:/g,'');
 return <svg className={`empty-illustration empty-art ${className}`} viewBox="0 0 168 132" aria-hidden="true" focusable="false">
  <g className="empty-art-back">
   <rect x="38" y="12" width="96" height="72" rx="11" transform="rotate(-7 86 48)"/>
  </g>
  <g className="empty-art-front">
   <rect x="28" y="28" width="112" height="84" rx="13"/>
   <clipPath id={clip}><rect x="28" y="28" width="112" height="84" rx="13"/></clipPath>
   <g clipPath={`url(#${clip})`}>
    <path className="empty-art-hill-far" d="M28 92 C40 80 50 70 60 70 C70 70 76 82 85 82 C94 82 99 74 107 74 C117 74 128 86 140 92 V112 H28 Z"/>
    <path className="empty-art-hill" d="M28 104 C39 94 47 87 56 87 C66 87 71 96 80 96 C90 96 95 89 104 89 C115 89 128 99 140 104 V112 H28 Z"/>
   </g>
   <circle className="empty-art-sun" cx="112" cy="52" r="8"/>
  </g>
  <g className="empty-art-badge">
   <circle cx="136" cy="106" r="13"/>
   <path d="M136 100.5 V111.5 M130.5 106 H141.5"/>
  </g>
 </svg>;
}
