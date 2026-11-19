import { pairs,points,positions,totals,routes,best,pairKey } from '../src/simulation.mjs';
const $ = id=>document.getElementById(id);
const guards=['A','B'];
let active=1,previous;
const markers=new Map();
const names=q=>[...q].join(' + ');
function draw() {
  const q = pairKey(...guards), count=totals[q], overlap=totals[guards[0]]+totals[guards[1]]-count;
  $('size').textContent=routes.length;
  $('score').textContent=count;
  $('meter').style.width=(100*count/routes.length)+'%';
  $('detail').textContent=guards[0]+' reaches '+totals[guards[0]]+' and '+guards[1]+' reaches '+totals[guards[1]]+'. '+overlap+' pass both crossings and count once.';
  const alt=q===best?'AB':best;
  $('compare').textContent='Compare with '+names(alt);
  if(previous) {
    const diff=count-totals[previous];
    $('delta').textContent=(diff===0?'Same reach':Math.abs(diff)+' '+(diff>0?'more':'fewer')+' students')+' compared with '+names(previous)+'.';
  }
  for (const [point,b] of markers) {
    const i=guards.indexOf(point);
    b.classList.toggle('selected',i!==-1);
    b.setAttribute('aria-label','Crossing '+point+', '+totals[point]+' students'+(i<0?'':', guard '+(i+1)));
    b.title=b.getAttribute('aria-label');
    b.replaceChildren(point);
    if(i>=0) {const n=document.createElement('span');n.className='guardno';n.textContent=i+1;b.append(n);}
  }
  guards.forEach((p,i)=>{const s=$('g'+(i+1));s.value=p; for(const opt of s.options)opt.disabled=opt.value===guards[1-i];});
}
function place(i,p) {
  if(!points.includes(p)||guards.includes(p))return;
  previous=pairKey(...guards);guards[i]=p;active=i;draw();
}
for(const [i,p] of points.entries()){
  const b=document.createElement('button'); b.className='point'; b.type='button';
  const [x,y]=positions[i];b.style.left=x/8+'%';b.style.top=y/5.3+'%';
  let start,skipClick=false;
  b.onpointerdown=e=>{
    skipClick=false;
    if(guards.includes(p)){start=[e.clientX,e.clientY];active=guards.indexOf(p);b.setPointerCapture(e.pointerId);}
  };
  b.onpointerup=e=>{
    if(!start)return;
    const moved=Math.hypot(e.clientX-start[0],e.clientY-start[1])>6;start=null;
    if(moved){skipClick=true;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.point');if(target)place(active,target.dataset.point);}
  };
  b.onpointercancel=()=>{start=null;};
  b.onclick=()=>{if(skipClick){skipClick=false;return;} if(guards.includes(p)){active=guards.indexOf(p);$('delta').textContent='Guard '+(active+1)+' selected. Tap an empty crossing.';}else place(active,p);};
  b.dataset.point=p;markers.set(p,b);$('markers').append(b);
}
guards.forEach((p,i)=>{const s=$('g'+(i+1));for(const q of points)s.add(new Option('Crossing '+q,q));s.onchange=()=>place(i,s.value);});
$('compare').onclick=()=>{previous=pairKey(...guards);const q=previous===best?'AB':best;guards.splice(0,2,...q);draw();};
draw();

let bundle;
async function inspect(omit) {
  $('inspection').hidden=false;
  try {
    const {verifyBundle}=await import('../src/verify.mjs');
    const response=await fetch($('bundle').href);
    if(!response.ok)throw Error('Download failed');
    bundle=await response.json();
    if(omit)bundle.contributions.pop();
    const counts=verifyBundle(bundle);
    $('checks').textContent='Signatures and bundle hash verified for '+bundle.round.members.length+' members. '+Object.entries(counts).map(([q,n])=>names(q)+' reached '+n).join('. ')+'.';
  } catch(e){$('checks').textContent='Verification refused. '+e.message;}
}
$('inspect').onclick=()=>inspect(false);$('omit').onclick=()=>inspect(true);
import status from './status.json' with {type:'json'};
if(status.anchor){
  $('runTitle').textContent='Diana testnet round';$('runInfo').textContent='Three client processes on one computer. Check the key registrations and the round commitment using the standalone verifier.';
  $('bundle').href='./diana.json';
  const a=document.createElement('a');a.href='https://explore.qore.network/tx/'+status.anchor;a.textContent='Explorer transaction';$('runInfo').after(a);
}
