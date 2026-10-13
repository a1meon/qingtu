export function OptimizeIcon({size=24,...props}){
 return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden {...props}>
  <path d="M9 4H5a1 1 0 0 0-1 1v4m19-5h4a1 1 0 0 1 1 1v4M4 23v4a1 1 0 0 0 1 1h4m19-5v4a1 1 0 0 1-1 1h-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  <rect x="8" y="10" width="16" height="12" rx="2.5" fill="currentColor" opacity=".18"/>
  <path d="M12 13v6m8-6v6M16 12v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
 </svg>;
}
