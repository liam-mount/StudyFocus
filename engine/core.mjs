import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {setTimeout as delay} from 'node:timers/promises'
import {setup,cleanProfile,cleanSchedule,scheduleConflict,nextRun,dateKey,durationMin,elapsedWork,id,fail} from './rules.mjs'
import {phaseAt,totalMs,focusMs,summarise} from './session.mjs'
export class Engine{
 constructor(repo,platform,{clock=Date.now,legacyDir=path.join(os.homedir(),'.studyfocus'),hosts=null}={}){
  this.repo=repo;this.platform=platform;this.clock=clock;this.legacyDir=legacyDir;this.hosts=hosts;this.clients=new Map();this.pending=null;this.queue=Promise.resolve();this.lastTick=clock();this.lastPersist=clock();this.error=repo.warning;this.appHealthy=true
 }
 get data(){return this.repo.data}
 serial(fn){const task=this.queue.then(fn);this.queue=task.catch(()=>{});return task}
 change(fn){return this.repo.transaction(fn)}
 chromeClients(){return [...this.clients.values()].filter(c=>this.clock()-c.lastSeen<10000)}
 policy(){
  const s=this.pending||this.data.session
  return {revision:s?`${s.id}:${s.startedAt}`:`idle:${this.data.revision}`,now:this.clock(),session:s?{id:s.id,startedAt:s.startedAt,mode:s.mode,rounds:s.rounds,workMs:s.workMs,breakMs:s.breakMs,endsAt:s.startedAt+totalMs(s),sites:s.siteBlocklist}:null}
 }
 chromeSync(payload={}){
  if(typeof payload.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(payload.id))fail('Invalid browser identity.')
  if(this.clients.size>50&&!this.clients.has(payload.id))fail('Too many Chrome profiles connected.')
  this.clients.set(payload.id,{id:payload.id,name:String(payload.name||'Chrome profile').slice(0,60),lastSeen:this.clock(),revision:String(payload.revision||''),incognito:!!payload.incognito,error:payload.error?String(payload.error).slice(0,180):undefined})
  return this.policy()
 }
 releaseConfirmed(){const clients=this.chromeClients();const hosts=this.hosts?.status?.();return clients.length>0&&clients.every(c=>c.revision===this.policy().revision&&!c.error)&&(!this.data.pendingHosts||(hosts&&!hosts.armed&&hosts.at>=(this.data.releaseAt||0)))}
 async waitRelease(timeout){const until=Date.now()+timeout;while(Date.now()<until){if(this.releaseConfirmed())return true;await delay(100)}return false}
 async waitChrome(key,timeout=6500){
  const until=Date.now()+timeout
  while(Date.now()<until){const clients=this.chromeClients();if(clients.length&&clients.every(c=>c.revision===key&&!c.error))return true;await delay(100)}return false
 }
 snapshot(){
  const s=this.data.session;const clients=this.chromeClients();const key=this.policy().revision
  const completed=this.data.history.filter(h=>['completed','legacy'].includes(h.outcome));const stats=summarise(completed)
  return {now:this.clock(),revision:this.data.revision,session:s?{...s,...phaseAt(s,this.clock()),totalMs:totalMs(s)}:null,profiles:this.data.profiles,schedules:this.data.schedules.map(s=>({...s,nextRun:nextRun(s,this.clock())})),history:[...this.data.history].reverse(),settings:this.data.settings,health:{engine:true,pid:process.pid,apps:this.appHealthy,chrome:clients,chromeReady:clients.length>0&&clients.every(c=>!c.error&&(!s?.siteBlocklist.length||c.revision===key)),pendingRelease:this.data.pendingRelease,error:this.error,simulation:this.platform.simulation,hosts:this.hosts?.status?.()??null},stats,legacyAvailable:!this.data.migration&&['history.json','prefs.json','session.json'].some(file=>fs.existsSync(path.join(this.legacyDir,file)))}
 }
 async dispatch(command,payload){
  if(command==='state')return this.snapshot()
  if(command==='chrome.sync')return this.chromeSync(payload)
  if(command==='apps')return this.platform.apps()
  return this.serial(async()=>{
   if(command==='start')await this.start(payload)
   else if(command==='emergency')await this.finish('emergency')
   else if(command==='system.repair'){if(this.data.session?.systemSites)await this.hosts?.prepare(this.data.session);else if(this.data.pendingHosts)await this.hosts?.repair();this.error=null;}
   else if(command==='profiles.save'){
    const p=cleanProfile(payload,await this.platform.resolve(payload.apps));if(payload.id&&!this.data.profiles.some(x=>x.id===payload.id))fail('Profile no longer exists.')
    const profiles=[...this.data.profiles.filter(x=>x.id!==p.id),p];if(scheduleConflict(this.data.schedules,profiles))fail('This duration would make enabled schedules overlap.')
    this.change(d=>{d.profiles=profiles})
   }else if(command==='profiles.delete'){
    if(this.data.schedules.some(s=>s.profileId===payload.id))fail('Delete this profile’s schedules first.')
    this.change(d=>{d.profiles=d.profiles.filter(p=>p.id!==payload.id)})
   }else if(command==='schedules.save'){
    const s=cleanSchedule(payload,this.data.profiles);const profile=this.data.profiles.find(p=>p.id===s.profileId)
    if(s.enabled&&!profile.apps.length&&!profile.sites.length)fail('Add an app or website to the profile before scheduling it.')
    if(payload.id&&!this.data.schedules.some(x=>x.id===payload.id))fail('Schedule no longer exists.')
    const schedules=[...this.data.schedules.filter(x=>x.id!==s.id),s]
    if(scheduleConflict(schedules,this.data.profiles))fail('This schedule overlaps another enabled commitment. Choose another time.')
    const next=nextRun(s,this.clock());if(this.data.session&&next&&next<this.data.session.startedAt+totalMs(this.data.session))fail('This schedule would overlap your active session.')
    this.change(d=>{d.schedules=schedules})
   }else if(command==='schedules.delete')this.change(d=>{d.schedules=d.schedules.filter(s=>s.id!==payload.id)})
   else if(command==='settings.save'){
    if(payload.appearance&&!['system','light','dark'].includes(payload.appearance))fail('Unknown appearance.')
    if(this.data.session&&typeof payload.systemSites==='boolean'&&payload.systemSites!==this.data.settings.systemSites)fail('System website blocking cannot be changed during a session.')
    this.change(d=>{for(const key of ['appearance','notifications','systemSites'])if(payload[key]!==undefined){if(key!=='appearance'&&typeof payload[key]!=='boolean')fail('Invalid setting.');d.settings[key]=payload[key]}})
   }else if(command==='onboarding.complete')this.change(d=>{d.settings.onboardingCompleted=true})
   else if(command==='importLegacy')await this.importLegacy()
   else if(command==='export')return {schema:1,exportedAt:new Date(this.clock()).toISOString(),profiles:this.data.profiles,schedules:this.data.schedules,history:this.data.history,settings:this.data.settings}
   else fail('Unknown StudyFocus command.')
   return this.snapshot()
  })
 }
 async start(input,{schedule=null}={}){
  if(fs.existsSync(path.join(this.repo.dir,'emergency-unlock.json')))await this.reconcileRecovery()
  if(this.data.session||this.pending)fail('A strict session is already running. Use Emergency unlock if you need to end it.')
  if(this.data.pendingRelease)fail('Previous website rules are still being released. Connect Chrome or use Repair in Settings.')
  if(!this.platform.simulation){try{const previous=JSON.parse(fs.readFileSync(path.join(this.legacyDir,'session.json'),'utf8'));if(previous&&phaseAt(previous,this.clock()).phase!=='done')fail('An original StudyFocus commitment is still active. Finish it before starting in the renovated app.')}catch(e){if(e.code!=='ENOENT')throw e}}
  const p=setup(input);const blocklist=await this.platform.resolve(p.apps)
  if(!blocklist.length&&!p.sites.length)fail('Add at least one app or website.')
  if(input.profileId&&!this.data.profiles.some(x=>x.id===input.profileId))fail('Profile no longer exists.')
  const length=durationMin(p)*60000
  if(!schedule)for(const s of this.data.schedules){const next=nextRun(s,this.clock());if(next&&next<this.clock()+length)fail('This session would overlap a scheduled commitment. Shorten it or change the future schedule first.')}
  if(p.sites.length&&!this.platform.simulation&&!this.chromeClients().length)fail('Connect the StudyFocus Chrome extension before starting website blocking.')
  const pending={id:id(),profileId:input.profileId||null,label:String(input.label||'').trim().slice(0,80),mode:p.mode,workMs:p.workMin*60000,breakMs:p.breakMin*60000,rounds:p.rounds,blocklist,siteBlocklist:p.sites,startedAt:this.clock(),events:[],blockCount:0,verifiedMs:0,scheduleId:schedule?.id||null,systemSites:!!this.data.settings.systemSites&&p.sites.length>0}
  this.pending=pending
  try{
   if(p.sites.length&&!this.platform.simulation&&!await this.waitChrome(this.policy().revision))fail('Chrome did not confirm the website rules. The session was not started.')
   if(pending.systemSites&&p.sites.length){if(!this.hosts)fail('System website helper is unavailable.');await this.hosts.prepare(pending)}
   pending.startedAt=this.clock()
   this.change(d=>{d.session=pending;d.pendingRelease=false;d.pendingHosts=false})
   this.pending=null;this.lastTick=this.clock();this.error=null
   if(this.hosts&&pending.systemSites)await this.hosts.update(pending)
  }catch(e){
   this.pending=null;this.hosts?.clear?.();this.change(d=>{d.session=null;d.pendingRelease=p.sites.length>0&&!this.platform.simulation;d.pendingHosts=!!pending.systemSites&&!this.platform.simulation;d.releaseAt=this.clock()});this.error=e.message
   if(this.data.pendingRelease&&await this.waitRelease(2500))this.change(d=>{d.pendingRelease=false;d.pendingHosts=false})
   throw e
  }
 }
 async finish(outcome,recoveryAt=null){
  const s=this.data.session;if(!s){if(this.data.pendingRelease){this.hosts?.clear?.();return}return}
  const now=recoveryAt===null?this.clock():Math.max(s.startedAt,Math.min(this.clock(),recoveryAt));const endedAt=outcome==='completed'?s.startedAt+totalMs(s):now
  this.change(d=>{
   d.session=null;d.pendingRelease=s.siteBlocklist.length>0&&!this.platform.simulation;d.pendingHosts=!!s.systemSites&&!this.platform.simulation;d.releaseAt=this.clock()
   if(!d.history.some(h=>h.id===s.id))d.history.push({id:s.id,label:s.label,profileId:s.profileId,mode:s.mode,startedAt:s.startedAt,endedAt,focusedMs:outcome==='completed'?focusMs(s):elapsedWork(s,now),verifiedMs:Math.min(s.verifiedMs,elapsedWork(s,now)),blocks:s.blockCount,blocked:s.blocklist.map(a=>a.name),blockedSites:s.siteBlocklist,outcome})
  })
  this.platform.strikes.clear();this.hosts?.clear?.()
  if(this.data.pendingRelease&&await this.waitRelease(2500))this.change(d=>{d.pendingRelease=false;d.pendingHosts=false})
 }
 async reconcileRecovery(){
  const marker=path.join(this.repo.dir,'emergency-unlock.json')
  if(!fs.existsSync(marker))return
  // Preserve the deliberate emergency outcome, even when recovery happened while the engine was offline.
  const value=JSON.parse(fs.readFileSync(marker,'utf8'));if(!Number.isFinite(value.at))fail('The emergency recovery marker could not be read.')
  if(this.data.session)await this.finish('emergency',value.at)
  else this.hosts?.clear?.()
  fs.unlinkSync(marker)
 }
 async tick(){return this.serial(async()=>{
  await this.reconcileRecovery()
  const now=this.clock();const elapsed=now-this.lastTick;this.lastTick=now
  const s=this.data.session
  if(s){
   const phase=phaseAt(s,now)
   if(phase.phase==='done'){await this.finish('completed')}
   else if(phase.enforcing){
    try{
     const events=await this.platform.enforce(s.blocklist);this.appHealthy=true
     const hosts=this.hosts?.status?.();const hostsOk=!s.systemSites||(hosts?.sessionId===s.id&&hosts?.armed&&now-hosts.at<4000)
     if(!hostsOk)this.error='System website rules need repair. Open Settings and choose Repair.'
     const chromeOk=!s.siteBlocklist.length||this.platform.simulation||this.chromeClients().length&&this.chromeClients().every(c=>c.revision===this.policy().revision&&!c.error)
     const next=structuredClone(this.data)
     if(elapsed>=0&&elapsed<=3000&&chromeOk&&hostsOk)next.session.verifiedMs+=Math.max(0,elapsedWork(s,now)-elapsedWork(s,now-elapsed))
     for(const e of events){const prev=next.session.events.findLast(x=>x.app===e.app&&now-x.t<90000);if(prev){prev.t=now;prev.count++;prev.action=e.action}else{next.session.events.push({t:now,count:1,...e});next.session.blockCount++}}
     next.session.events=next.session.events.slice(-200)
     // Memory accumulation is serialized; checkpoint at most every 10 seconds.
     this.repo.data=next
     if(events.length||now-this.lastPersist>10000){this.repo.save(next);this.lastPersist=now}
    }catch(e){this.appHealthy=false;this.error=e.message}
   }
  }
  if(this.data.pendingRelease&&this.releaseConfirmed())this.change(d=>{d.pendingRelease=false;d.pendingHosts=false})
  await this.checkSchedules(now)
 })}
 async checkSchedules(now){
  const previous=this.data.lastSchedulerAt||now;const gap=now-previous
  if(gap<5000&&dateKey(previous)===dateKey(now)&&new Date(previous).getMinutes()===new Date(now).getMinutes())return
  for(const schedule of this.data.schedules.filter(x=>x.enabled)){
   // Consider starts since the last check, bounded to the last week after long shutdowns.
   for(let dayOffset=0;dayOffset<Math.min(8,Math.ceil(Math.max(0,gap)/86400000)+1);dayOffset++){
    const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-dayOffset)
    if(!schedule.days.includes(d.getDay()))continue
    const [h,m]=schedule.time.split(':').map(Number);d.setHours(h,m,0,0)
    const t=d.getTime(),key=`${schedule.id}:${dateKey(t)}`
    if(t>now||t<=previous||this.data.scheduleRuns[key])continue
    const profile=this.data.profiles.find(p=>p.id===schedule.profileId)
    this.change(x=>{x.scheduleRuns[key]=true})
    let outcome=null,detail=''
    if(d.getHours()!==h||d.getMinutes()!==m||now-t>15000||gap>30000){outcome='missed';detail='Start missed while your Mac or StudyFocus was unavailable.'}
    else if(this.data.session){outcome='failed';detail='Another commitment was already active.'}
    else if(!profile){outcome='failed';detail='The schedule’s profile is unavailable.'}
    else{try{await this.start({...profile,profileId:profile.id,label:profile.name},{schedule})}catch(e){outcome='failed';detail=e.message}}
    if(outcome)this.change(x=>{x.history.push({id:key,label:profile?.name||'Scheduled session',profileId:schedule.profileId,mode:profile?.mode||'focus',startedAt:t,endedAt:now,focusedMs:0,verifiedMs:0,blocks:0,blocked:[],blockedSites:[],outcome,detail})})
   }
  }
  this.change(d=>{d.lastSchedulerAt=now;const keys=Object.keys(d.scheduleRuns);for(const k of keys.slice(0,Math.max(0,keys.length-1000)))delete d.scheduleRuns[k]})
 }
 async importLegacy(){
  if(this.data.session||this.data.migration)fail('Migration has already run, or a session is active.')
  let legacySession=null
  try{legacySession=JSON.parse(fs.readFileSync(path.join(this.legacyDir,'session.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')fail('The old session file could not be read. It has not been changed.')}
  if(legacySession&&phaseAt(legacySession,this.clock()).phase!=='done')fail('Finish the active session in the original StudyFocus before importing. The original enforcer must be stopped before switching.')
  let history=[];try{history=JSON.parse(fs.readFileSync(path.join(this.legacyDir,'history.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')fail('The old history file could not be read.')}
  if(!Array.isArray(history)||history.some(h=>!h.id||!Number.isFinite(h.startedAt)||!Number.isFinite(h.focusedMs)))fail('The old history has an unsupported format. Your files are unchanged.')
  const backup=path.join(this.repo.dir,'legacy-backup');fs.mkdirSync(backup,{recursive:true,mode:0o700})
  for(const f of ['history.json','prefs.json','session.json']){const p=path.join(this.legacyDir,f);if(fs.existsSync(p))fs.copyFileSync(p,path.join(backup,f))}
  let importedProfile=null;const skippedApps=[]
  const prefsPath=path.join(this.legacyDir,'prefs.json')
  if(fs.existsSync(prefsPath)){
   let prefs;try{prefs=JSON.parse(fs.readFileSync(prefsPath,'utf8'))}catch{fail('The old preferences could not be read. Your original files and backup are unchanged.')}
   const apps=[]
   for(const target of prefs.lastBlocklist||[]){try{apps.push(...await this.platform.resolve([target]))}catch{skippedApps.push(target?.name||'Unknown app')}}
   const config={mode:'focus',workMin:45,breakMin:5,rounds:4,...prefs.lastSetup,apps,sites:prefs.lastSites||[],name:'Imported setup',color:'#4776df'}
   try{importedProfile=cleanProfile(config,apps)}catch{fail('The old session defaults need correction before they can be imported. Your original files are unchanged.')}
  }
  if(legacySession&&!history.some(h=>h.id===legacySession.id))history.push({id:legacySession.id,label:legacySession.label||'',mode:legacySession.mode,startedAt:legacySession.startedAt,endedAt:legacySession.startedAt+totalMs(legacySession),focusedMs:focusMs(legacySession),blocks:legacySession.blockCount||0,blocked:(legacySession.blocklist||[]).map(a=>a.name),blockedSites:legacySession.siteBlocklist||[]})
  this.change(d=>{for(const h of history)if(!d.history.some(x=>x.id===h.id))d.history.push({...h,outcome:'legacy',verifiedMs:0,blocked:h.blocked||[],blockedSites:h.blockedSites||[]});if(importedProfile)d.profiles.push(importedProfile);d.migration={at:this.clock(),entries:history.length,skippedApps}})
  if(skippedApps.length)this.error=`Imported history and defaults. Unavailable or protected apps were omitted: ${skippedApps.join(', ')}.`
 }
}
