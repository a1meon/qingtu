const handlers=new Set();
export const addFlushHandler=handler=>{handlers.add(handler);return ()=>handlers.delete(handler);};
export async function flushWork(){await Promise.all([...handlers].map(handler=>handler()));}
