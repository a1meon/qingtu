let send;
export function setNativeTransport(transport){send=transport;}
export const native=(method,...args)=>send(method,...args);
