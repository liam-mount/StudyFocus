import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
const run=promisify(execFile)
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'"
export class HostsController{
 constructor(dir,native,{simulation=false}={}){this.dir=dir;this.native=native;this.simulation=simulation;this.file=path.join(dir,'hosts-session.json');this.statusFile=path.join(dir,'hosts-status.json')}
 async update(session){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(session),{mode:0o600});fs.renameSync(tmp,this.file)}
 status(){try{return JSON.parse(fs.readFileSync(this.statusFile,'utf8'))}catch{return null}}
 clear(){try{fs.unlinkSync(this.file)}catch{}}
 async repair(){
  this.clear();if(this.simulation)return
  const inner=`${quote(this.native)} hosts ${quote(this.dir)} >/dev/null 2>&1 &`
  await run('/usr/bin/osascript',['-e',`do shell script ${JSON.stringify(inner)} with administrator privileges with prompt "StudyFocus needs permission to clear its remaining system website rules."`],{timeout:120000})
 }
 async prepare(session){
  await this.update(session);if(this.simulation)return
  // Only the bundled native executable can be elevated; never invoke repository JavaScript as root.
  const inner=`${quote(this.native)} hosts ${quote(this.dir)} >/dev/null 2>&1 &`
  const script=`do shell script ${JSON.stringify(inner)} with administrator privileges with prompt "StudyFocus needs permission to apply system website rules for this session."`
  try{await run('/usr/bin/osascript',['-e',script],{timeout:120000})}catch{this.clear();throw Error('System website permission was declined. The session did not start.')}
  const until=Date.now()+6000
  while(Date.now()<until){const status=this.status();if(status?.sessionId===session.id&&status?.armed&&Date.now()-status.at<4000)return;await delay(100)}
  this.clear();throw Error('The system website helper did not confirm its rules. The session did not start.')
 }
}
