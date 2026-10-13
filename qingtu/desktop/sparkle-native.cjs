const path=require('node:path');
module.exports={install({feedUrl,onEvent}){
 const bridge=require(path.join(process.resourcesPath,`qingtu-sparkle-${process.arch}.node`));
 bridge.install(feedUrl,json=>onEvent(JSON.parse(json)));
}};
