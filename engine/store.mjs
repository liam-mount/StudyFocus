import fs from 'node:fs'
import path from 'node:path'
export const initial=()=>({schema:1,revision:0,session:null,profiles:[],schedules:[],history:[],settings:{appearance:'system',notifications:true,onboardingCompleted:false,systemSites:false},scheduleRuns:{},lastSchedulerAt:Date.now(),migration:null,pendingRelease:false,pendingHosts:false,releaseAt:0})
function valid(v){return v&&v.schema===1&&Number.isInteger(v.revision)&&Array.isArray(v.profiles)&&Array.isArray(v.schedules)&&Array.isArray(v.history)&&v.settings&&v.scheduleRuns&&(!v.session||(Number.isFinite(v.session.startedAt)&&Number.isFinite(v.session.workMs)&&Array.isArray(v.session.blocklist)&&Array.isArray(v.session.siteBlocklist)))}
export class Repository{
 constructor(dir){this.dir=dir;fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);this.file=path.join(dir,'state.json');this.warning=null;this.data=this.read()}
 read(){
  if(!fs.existsSync(this.file))return initial()
  try{const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!valid(data))throw Error('Invalid data schema');return data}
  catch(err){
   try{const backup=JSON.parse(fs.readFileSync(this.file+'.bak','utf8'));if(!valid(backup))throw Error('Invalid backup');fs.copyFileSync(this.file,`${this.file}.corrupt-${Date.now()}`);this.warning='Recovered the last valid local backup. Review your current session and schedules.';return backup}
   catch{throw Error('StudyFocus data could not be read. Your files have been preserved. Restore a valid backup before starting another session.')}
  }
 }
 save(data){
  if(!valid(data))throw Error('Refusing to save invalid StudyFocus state.')
  const tmp=this.file+'.tmp';const body=JSON.stringify(data,null,2)
  const fd=fs.openSync(tmp,'w',0o600)
  try{fs.writeFileSync(fd,body);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  if(fs.existsSync(this.file)&&!this.warning)fs.copyFileSync(this.file,this.file+'.bak')
  fs.renameSync(tmp,this.file);fs.chmodSync(this.file,0o600);this.data=data
 }
 transaction(fn){const next=structuredClone(this.data);const result=fn(next);next.revision++;this.save(next);return result}
}
