export function cosine(a,b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length!==b.length) throw new Error("Embedding dimensions differ");
  let dot=0,na=0,nb=0;
  for(let i=0;i<a.length;i++) {
    if(!Number.isFinite(a[i])||!Number.isFinite(b[i])) throw new Error("Invalid embedding");
    dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];
  }
  return na>0&&nb>0 ? dot/Math.sqrt(na*nb) : 0;
}
export function eligible(q,filters) {
  if(!q || !filters) return false;
  if(q.minutes>filters.minutes) return false;
  if(filters.access==="seated"&&!q.seated) return false;
  if(filters.place!=="any"&&!q.places.includes(filters.place)&&!q.places.includes("any")) return false;
  if(filters.weather==="any"&&!q.weather.includes("any")) return false;
  if(filters.weather!=="any"&&!q.weather.includes(filters.weather)&&!q.weather.includes("any")) return false;
  return true;
}
export function rank(quests, vectors, promptVector, filters) {
  if(quests.length!==vectors.length) throw new Error("Quest / vector count mismatch");
  const results=[];
  quests.forEach((quest,index)=>{
    if(!eligible(quest,filters)) return;
    const similarity=cosine(promptVector,vectors[index]);
    // The open-weight embedding model determines relevance. Constraints are hard safety/accessibility gates.
    // Stable id ordering resolves ties; never pretend a fallback heuristic is AI inference.
    results.push({quest,similarity});
  });
  return results.sort((a,b)=>b.similarity-a.similarity || a.quest.id.localeCompare(b.quest.id));
}
export function validateFilters(filters) {
  if(!Number.isInteger(filters.minutes)||filters.minutes<5||filters.minutes>120) throw new Error("Invalid time budget");
  if(!["any","city","park","water","home"].includes(filters.place)) throw new Error("Invalid surroundings");
  if(!["any","clear","rain"].includes(filters.weather)) throw new Error("Invalid weather");
  if(!["any","seated"].includes(filters.access)) throw new Error("Invalid mobility option");
  return filters;
}
