export function CompressionIcon({size=30,weight,...props}){
 return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={weight==='bold'?2.5:2} strokeLinecap="round" strokeLinejoin="round" data-icon="image-compression" {...props}>
  <rect x="6" y="7" width="20" height="18" rx="2"/>
  <circle cx="12" cy="12" r="1.4"/>
  <path d="m8 22 5-6 4 4 3-3 4 5M2 2l6 6M2 8h6V2m22 28-6-6m6 0h-6v6"/>
 </svg>;
}
