import {NtExecutable,NtExecutableResource} from 'resedit';

export function applyWindowManifest(bytes) {
 const executable=NtExecutable.from(bytes),resources=NtExecutableResource.from(executable);
 const entries=resources.entries.filter(e=>e.type===24&&e.id===1);
 if(entries.length!==1)throw new Error('Expected exactly one application manifest');
 const entry=entries[0],manifest=Buffer.from(entry.bin).toString('utf8');
 if(manifest.includes('<dpiAwareness')){
  if(!/<dpiAwareness[^>]*>PerMonitorV2,PerMonitor<\/dpiAwareness>/.test(manifest))throw new Error('Unexpected existing DPI policy');
  return Buffer.from(bytes);
 }
 if(!manifest.includes('</assembly>')||/<application\b/.test(manifest))throw new Error('Unexpected application manifest structure');
 const policy='<application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware><dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2,PerMonitor</dpiAwareness></windowsSettings></application>';
 entry.bin=new TextEncoder().encode(manifest.replace('</assembly>',policy+'</assembly>')).buffer;
 resources.outputResource(executable);
 return Buffer.from(executable.generate());
}
