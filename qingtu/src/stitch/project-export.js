export function exportProjectIds(projects,current,selection=null){
 const selected=selection===null?null:new Set(selection);
 return projects.filter(project=>(project.id===current?.id?current.images.length:project.count)>0&&(!selected||selected.has(project.id))).map(project=>project.id);
}
