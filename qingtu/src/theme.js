// Theme choice: 'system' follows the OS appearance; 'light'/'dark' are explicit.
// The choice is stored per user and mirrored to the native window frame.
const KEY='qingtu.theme';
export const THEMES=['system','light','dark'];
export function storedTheme(){
 try{const value=localStorage.getItem(KEY);return THEMES.includes(value)?value:'system';}catch{return 'system';}
}
let fade;
export function applyTheme(theme,{animate=false}={}){
 const root=document.documentElement;
 if(animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
  root.classList.add('theme-changing');clearTimeout(fade);fade=setTimeout(()=>root.classList.remove('theme-changing'),320);
 }
 if(theme==='light'||theme==='dark')root.dataset.theme=theme;else delete root.dataset.theme;
 try{localStorage.setItem(KEY,theme);}catch{}
 window.qingtu?.setTheme?.(theme)?.catch?.(()=>{});
}
