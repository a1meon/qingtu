export function exportProjectIds(projects,current){
 return projects.filter(project=>(project.id===current?.id?current.images.length:project.count)>0).map(project=>project.id);
}
