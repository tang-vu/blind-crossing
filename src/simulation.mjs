export const points = [...'ABCDEFGH'];
export const positions = [[238,205],[425,205],[573,351],[105,118],[425,82],[699,169],[238,389],[83,401]];
export const routes = [[10,'ABC'],[43,'AB'],[7,'A'],[2,'B'],[30,'C'],[2,'D'],[2,'E'],[2,'F'],[1,'G'],[1,'H']]
  .flatMap(([count,route])=> Array.from({length:count},()=>route));
export const pairs = points.flatMap((p,i)=>points.slice(i+1).map(q=>p+q));
export function tally(routes,options) {
  return Object.fromEntries(options.map(q=>[q,routes.filter(route=>[...q].some(p=>route.includes(p))).length]));
}
export const totals = tally(routes,[...points,...pairs]);
export const best = pairs.reduce((a,b)=>totals[a]>=totals[b]?a:b);
export const pairKey = (a,b)=>[a,b].sort().join('');
