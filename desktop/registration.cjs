const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util')
const run=promisify(execFile),label='com.studyfocus.engine'
const plist=()=>path.join(os.homedir(),'Library/LaunchAgents',label+'.plist')
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
async function legacyStatus(){try{await run('/bin/launchctl',['print',`gui/${process.getuid()}/${label}`],{timeout:10000});return {ok:true,status:'enabled',method:'launchAgent',message:'Background recovery is enabled for this Mac account.'}}catch{return null}}
async function status(native){const loaded=await legacyStatus();if(loaded)return loaded;const {stdout}=await run(native,['status'],{timeout:10000});return JSON.parse(stdout)}
async function install(native,executable){
 const known=await legacyStatus()
 if(!known){try{const {stdout}=await run(native,['register'],{timeout:20000});const result=JSON.parse(stdout);if(result.status==='enabled'||result.status==='requiresApproval')return {...result,method:'SMAppService'}}catch{}}
 const file=plist();fs.mkdirSync(path.dirname(file),{recursive:true})
 const content=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(executable)}</string><string>--service</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ProcessType</key><string>Background</string><key>ThrottleInterval</key><integer>5</integer></dict></plist>`
 if(known&&fs.existsSync(file)&&fs.readFileSync(file,'utf8')===content)return known
 if(known)await run('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`],{timeout:15000})
 fs.writeFileSync(file+'.tmp',content,{mode:0o600});fs.renameSync(file+'.tmp',file)
 try{await run('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,file],{timeout:20000})}catch(e){throw Error('macOS could not enable the background service. Allow StudyFocus in Login Items & Extensions, then try Repair.')}
 return {ok:true,status:'enabled',method:'launchAgent',message:'Background recovery is enabled. StudyFocus will resume at login.'}
}
async function remove(native){
 if(await legacyStatus())await run('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`],{timeout:20000})
 fs.rmSync(plist(),{force:true})
 try{await run(native,['unregister'],{timeout:15000})}catch{}
 return {ok:true,status:'notRegistered',message:'Login recovery has been removed. Closing StudyFocus will not change an already completed session.'}
}
module.exports={status,install,remove}
