import {optimizeHorizontal} from '../../engine/stitch-optimize.mjs';

// Report actual save/preview boundaries. The workbench supplies a decoded
// layout preview; byte encoding continues independently in its preview queue.
export async function performOptimization({project,save,render,preparePreview,reuse,onPhase}){
 onPhase('calculate');
 const next=optimizeHorizontal(project);
 if(next===project&&reuse)return {project,result:reuse,unchanged:true};
 if(next!==project){onPhase('save');await save(next);}
 onPhase('render');const result=await (preparePreview?preparePreview(next):render(next));
 return {project:next,result,layoutOnly:!!preparePreview,unchanged:next===project};
}
