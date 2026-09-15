import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile)
export const protectedIds=new Set(['com.apple.finder','com.apple.Terminal','com.googlecode.iterm2','com.apple.systempreferences','com.apple.ActivityMonitor','com.apple.MobileSMS','com.apple.FaceTime','com.apple.Maps','com.apple.AddressBook','com.apple.Console','com.apple.ScreenSharing','com.apple.loginwindow','com.studyfocus.desktop'])
export const protectedNames=new Set(['Finder','Terminal','iTerm','iTerm2','System Settings','System Preferences','Activity Monitor','Messages','FaceTime','Phone','Maps','Contacts','Console','StudyFocus','StudyFocusNative','Electron'])
export function protectedApp(a){return protectedIds.has(a.bundleId)||protectedNames.has(a.name)||a.bundleId?.startsWith('com.studyfocus.')||a.bundlePath?.startsWith('/System/')}
export class MacPlatform{
 constructor(native,{simulation=false}={}){this.native=native;this.simulation=simulation;this.strikes=new Map();this.catalog=[];this.lastScan=0;this.ok=true}
 async apps(extra=[]){
  if(this.simulation){this.catalog=[{id:'demo.editor',name:'Test Editor',bundleId:'demo.editor',bundlePath:'/Applications/Test Editor.app',protected:false},{id:'com.apple.finder',name:'Finder',bundleId:'com.apple.finder',bundlePath:'/System/Library/CoreServices/Finder.app',protected:true}];return this.catalog}
  const {stdout}=await run(this.native,['apps',...extra],{maxBuffer:20*1024*1024,timeout:30000})
  this.catalog=JSON.parse(stdout).map(a=>({...a,id:a.bundlePath,protected:protectedApp(a)}));this.lastScan=Date.now();return this.catalog
 }
 async resolve(targets){
  if(!Array.isArray(targets))throw Error('Choose applications from the app picker.')
  if(!targets.length)return []
  if(!this.catalog.length)await this.apps()
  const out=[]
  for(const a of targets){
   if(!a||typeof a.bundlePath!=='string')throw Error('Choose an application from the app picker.')
   let real=a.bundlePath
   if(!this.simulation){try{real=fs.realpathSync(real)}catch{throw Error(`${a.name||'An application'} is no longer installed.`)}}
   let found=this.catalog.find(x=>x.bundlePath===real)
   if(!found&&!this.simulation){const {stdout}=await run(this.native,['apps',real],{maxBuffer:20*1024*1024});found=JSON.parse(stdout).find(x=>x.bundlePath===real);if(found)found={...found,id:found.bundlePath,protected:protectedApp(found)}}
   if(!found)throw Error('That app is not in the verified application inventory.')
   if(protectedApp(found)||found.protected)throw Error(`${found.name} is protected and cannot be blocked.`)
   if(!out.some(x=>x.bundlePath===found.bundlePath))out.push({...found,icon:undefined})
  }return out
 }
 async enforce(targets){
  if(this.simulation)return []
  if(!targets.length)return []
  const {stdout}=await run(this.native,['running'],{timeout:5000,maxBuffer:4*1024*1024})
  const running=JSON.parse(stdout);const events=[];const alive=new Set(running.map(x=>x.pid))
  for(const pid of this.strikes.keys())if(!alive.has(pid))this.strikes.delete(pid)
  for(const r of running){
   if(protectedApp(r)||r.pid===process.pid)continue
   const target=targets.find(a=>a.bundlePath===r.bundlePath&&a.bundleId===r.bundleId&&!protectedApp(a));if(!target)continue
   const count=this.strikes.get(r.pid)||0
   try{const {stdout}=await run(this.native,['terminate',String(r.pid),target.bundlePath,target.bundleId,count>=3?'force':'graceful'],{timeout:5000});const result=JSON.parse(stdout);this.strikes.set(r.pid,count+1);if(result.closed)events.push({app:target.name,action:count>=3?'force-quit':'closed'});else if(count>=3)throw Error('Termination declined')}catch(e){throw Error(`Could not close ${target.name}. Check its permissions.`)}
  }return events
 }
}
