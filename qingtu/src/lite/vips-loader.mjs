export default async function Vips(options){const module=await import(/* @vite-ignore */ `${location.origin}/vips/vips-es6.js`);return module.default(options);}
