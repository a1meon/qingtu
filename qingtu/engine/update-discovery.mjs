// Public release discovery is metadata only. The selected manifest/archive still
// requires the original release signature and hash before it can be installed.
export function formalReleaseFromPage(html,repository){
 if(typeof html!=='string'||html.length>1024*1024)throw Error('发行版页面无效');
 const start=html.search(/<div\b[^>]*class=["'][^"']*\brelease-header-main\b/);if(start<0)throw Error('未找到正式发行版');
 const header=html.slice(start,start+4096).split(/<div\b[^>]*class=["'][^"']*\brelease-header-actions\b/)[0];
 if(!/class=["'][^"']*\blatest-version\b/.test(header))throw Error('不是最新正式发行版');
 const base=new URL(repository);
 for(const match of header.matchAll(/\bhref=["']([^"']+)["']/g)){
  const url=new URL(match[1],base);if(url.origin!==base.origin||url.search||url.hash||url.username||url.password)continue;
  const prefix=base.pathname+'releases/tag/';if(!url.pathname.startsWith(prefix))continue;
  const tag=url.pathname.slice(prefix.length);if(!/^v?\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(tag))continue;
  return {version:tag.replace(/^v/,''),tag,base:new URL('releases/download/'+tag+'/',base).href};
 }
 throw Error('正式发行版地址无效');
}
