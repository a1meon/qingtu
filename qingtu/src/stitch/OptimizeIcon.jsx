export function OptimizeIcon({size=24,...props}){
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden {...props}>
  <path d="M5 8.5h18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".15"/>
  <path d="M8 5v18m12-18v18M5 8.5h18M5 19.5h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  <path d="m10.5 15 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M3 11.5v5m22-5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
 </svg>;
}
