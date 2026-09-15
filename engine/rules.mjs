import {randomUUID} from 'node:crypto'
import {normalizeDomain} from '../shared/domains.js'
export const fail=(message)=>{throw new Error(message)}
export const id=()=>randomUUID()
const integer=(v,min,max,label)=>{
 const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)fail(`${label} must be a whole number from ${min} to ${max}.`);return n
}
export function setup(input={}){
 const mode=input.mode==='pomodoro'?'pomodoro':'focus'
 if(input.mode&&!['focus','pomodoro'].includes(input.mode))fail('Choose Focus or Pomodoro.')
 const workMin=integer(input.workMin,1,mode==='focus'?480:180,'Focus minutes')
 const breakMin=mode==='pomodoro'?integer(input.breakMin,1,60,'Break minutes'):5
 const rounds=mode==='pomodoro'?integer(input.rounds,1,12,'Rounds'):1
 if(rounds*workMin+(rounds-1)*breakMin>1440)fail('A commitment must fit within 24 hours.')
 if(!Array.isArray(input.apps)||input.apps.length>200)fail('Choose up to 200 applications.')
 if(!Array.isArray(input.sites)||input.sites.length>500)fail('Choose up to 500 websites.')
 const sites=[...new Set(input.sites.map(s=>normalizeDomain(s)||fail(`Invalid website: ${String(s).slice(0,80)}`)))]
 return {mode,workMin,breakMin,rounds,sites,apps:input.apps}
}
export const durationMin=p=>p.mode==='pomodoro'?p.rounds*p.workMin+(p.rounds-1)*p.breakMin:p.workMin
export function cleanProfile(input,apps){
 const p=setup({...input,apps});const name=String(input.name||'').trim()
 if(!name||name.length>60)fail('Give the profile a name of 1–60 characters.')
 return {...p,id:input.id||id(),name,color:/^#[a-f\d]{6}$/i.test(input.color||'')?input.color:'#4776df'}
}
export function cleanSchedule(input,profiles){
 if(!profiles.some(p=>p.id===input.profileId))fail('Choose an existing profile.')
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))fail('Choose a valid start time.')
 if(!Array.isArray(input.days)||!input.days.length||input.days.some(d=>!Number.isInteger(d)||d<0||d>6))fail('Choose at least one weekday.')
 return {id:input.id||id(),profileId:input.profileId,time:input.time,days:[...new Set(input.days)].sort(),enabled:!!input.enabled}
}
export function nextRun(schedule,now=Date.now()){
 if(!schedule.enabled)return null
 const [h,m]=schedule.time.split(':').map(Number)
 for(let i=0;i<9;i++){
  const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()+i);d.setHours(h,m,0,0)
  if(d.getHours()!==h||d.getMinutes()!==m)continue
  if(schedule.days.includes(d.getDay())&&d.getTime()>now)return d.getTime()
 }return null
}
export function scheduleConflict(schedules,profiles){
 const slots=[];const week=7*1440
 for(const s of schedules.filter(s=>s.enabled)){
  const p=profiles.find(p=>p.id===s.profileId);if(!p)continue
  const [h,m]=s.time.split(':').map(Number)
  for(const day of s.days){const start=day*1440+h*60+m;slots.push({id:s.id,start,end:start+durationMin(p)})}
 }
 for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)for(const shift of [-week,0,week]){
  const a=slots[i],b=slots[j];if(a.start<b.end+shift&&b.start+shift<a.end)return [a.id,b.id]
 }return null
}
export function dateKey(t){const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function elapsedWork(session,now){
 const elapsed=Math.max(0,Math.min(now-session.startedAt,session.mode==='pomodoro'?session.rounds*session.workMs+(session.rounds-1)*session.breakMs:session.workMs))
 if(session.mode!=='pomodoro')return elapsed
 const cycle=session.workMs+session.breakMs
 return Math.min(session.rounds*session.workMs,Math.floor(elapsed/cycle)*session.workMs+Math.min(session.workMs,elapsed%cycle))
}
