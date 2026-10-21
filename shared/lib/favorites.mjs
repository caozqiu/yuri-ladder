export const FAVORITES_KEY='yuri-ladder:favorites:v1';
export function parseFavorites(raw){
  try{const value=JSON.parse(raw);return Array.isArray(value)?[...new Set(value.filter(id=>typeof id==='string'&&/^\d{1,20}$/.test(id)))].slice(0,500):[];}catch{return [];}
}
export function toggleFavorite(ids,id){
  if(typeof id!=='string'||!/^\d{1,20}$/.test(id))return ids;
  return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id].slice(0,500);
}
