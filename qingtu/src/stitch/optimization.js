import {optimizeHorizontal} from '../../engine/stitch-optimize.mjs';

// Report real task boundaries. Encoding duration is unknown, so the dialog
// remains indeterminate until the engine has returned a validated preview.
export async function performOptimization({project,save,render,reuse,onPhase}){
 onPhase('calculate');
 const next=optimizeHorizontal(project);
 if(next===project&&reuse)return {project,result:reuse,unchanged:true};
 if(next!==project){onPhase('save');await save(next);}
 onPhase('render');const result=await render(next);
 return {project:next,result,unchanged:next===project};
}
