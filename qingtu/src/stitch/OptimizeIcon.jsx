export function OptimizeIcon({size=24,...props}){
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden {...props}>
  <rect x="4" y="6" width="20" height="16" rx="4" fill="currentColor" opacity=".16"/>
  <path d="M9 6h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.9"/>
  <circle cx="11" cy="11" r="1.5" fill="currentColor"/>
  <path d="m9 18 4-4 3 3 3-3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="m1.5 11.5 2.5 2.5-2.5 2.5m25-5-2.5 2.5 2.5 2.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}
