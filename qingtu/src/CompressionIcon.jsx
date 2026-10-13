export function CompressionIcon({size=30,weight='bold',...props}){
 return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={weight==='bold'?2.3:1.8} strokeLinecap="round" strokeLinejoin="round" data-icon="image-compression" {...props}>
  <path d="M19 4H8a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V12Z" fill="currentColor" fillOpacity=".12"/>
  <path d="M19 4v5a3 3 0 0 0 3 3h5"/>
  <circle cx="11" cy="13" r="1.5" fill="currentColor" stroke="none"/>
  <path d="m9 23 4-5 3 3 3-4 4 6"/>
 </svg>;
}
