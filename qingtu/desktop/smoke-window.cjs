const {app,screen}=require('electron');
// Test windows must never activate over the user's work.
if(process.platform==='darwin')app.setActivationPolicy('accessory');
function prepareSmokeWindow(win){
 const displays=screen.getAllDisplays(),right=Math.max(...displays.map(d=>d.bounds.x+d.bounds.width)),bottom=Math.max(...displays.map(d=>d.bounds.y+d.bounds.height));
 // Opacity also prevents a native window-manager adjustment from flashing UI.
 win.setOpacity(0);
 win.setAlwaysOnTop(false);
 win.setPosition(right+256,bottom+256);
 win.hide();
 win.setPosition(right+256,bottom+256);
}
module.exports={prepareSmokeWindow};
