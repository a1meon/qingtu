const fs=require('node:fs/promises');const path=require('node:path');
module.exports=async context=>{
 if(context.electronPlatformName!=='darwin')return;
 const app=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
 const framework=path.resolve('.cache/sparkle/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework');
 await fs.cp(framework,path.join(app,'Contents/Frameworks/Sparkle.framework'),{recursive:true,verbatimSymlinks:true});
 await fs.copyFile('.cache/sparkle/LICENSE',path.join(app,'Contents/Resources/Sparkle-LICENSE.txt'));
};
