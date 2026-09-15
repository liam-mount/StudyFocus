import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFile,spawn,execFileSync} from 'node:child_process'
import {promisify} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {createRequire} from 'node:module'
import {Repository} from '../engine/store.mjs'
import {MacPlatform} from '../engine/platform.mjs'
import {Engine} from '../engine/core.mjs'
const require=createRequire(import.meta.url),request=require('../desktop/client.cjs'),run=promisify(execFile)
const dir=fs.mkdtempSync('/tmp/studyfocus-macos-'),native=path.resolve('native/build/StudyFocusNative')
const target=path.join(dir,'Disposable Focus Target.app'),macos=path.join(target,'Contents/MacOS')
const children=[];let registered=false;const label=`com.studyfocus.test.${Date.now()}`
const wait=async(fn,timeout=15000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await fn())return;await delay(200)}throw Error('macOS test condition timed out')}
try{
 fs.mkdirSync(macos,{recursive:true});fs.writeFileSync(path.join(target,'Contents/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Disposable</string><key>CFBundleIdentifier</key><string>org.studyfocustest.disposable</string><key>CFBundleName</key><string>Disposable Focus Target</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>')
 fs.writeFileSync(path.join(dir,'Target.swift'),'import AppKit\nlet app=NSApplication.shared\napp.setActivationPolicy(.accessory)\napp.run()\n')
 await run('swiftc',[path.join(dir,'Target.swift'),'-module-cache-path',path.resolve('native/build/module-cache'),'-o',path.join(macos,'Disposable')],{timeout:120000})
 const platform=new MacPlatform(native);await platform.apps([target]);const targets=await platform.resolve([{name:'Fake display name',bundlePath:target}]);assert.equal(targets[0].bundleId,'org.studyfocustest.disposable')
 await assert.rejects(()=>platform.resolve([{name:'Unprotected fake name',bundlePath:'/System/Library/CoreServices/Finder.app'}]),/protected/)
 const launch=()=>{const child=spawn(path.join(macos,'Disposable'),[],{stdio:'ignore'});children.push(child);return child}
 const child=launch();await wait(async()=>JSON.parse((await run(native,['running'])).stdout).some(x=>x.pid===child.pid))
 const engine=new Engine(new Repository(path.join(dir,'data')),platform,{legacyDir:path.join(dir,'legacy')})
 await engine.dispatch('start',{mode:'focus',workMin:1,breakMin:5,rounds:1,apps:targets,sites:[]})
 await engine.tick();await wait(()=>child.exitCode!==null||child.signalCode!==null)
 await engine.dispatch('emergency');const after=launch();await delay(1500);await engine.tick();assert.equal(after.exitCode,null);assert.equal(after.signalCode,null)
 after.kill('SIGTERM')
 // Verify launchd recovery against an isolated service, never the user's real registration.
 const exe=process.env.STUDYFOCUS_APP||path.resolve('release/mac-arm64/StudyFocus.app/Contents/MacOS/StudyFocus')
 const serviceDir=path.join(dir,'service'),plist=path.join(dir,'test.plist'),xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 fs.writeFileSync(plist,`<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(exe)}</string><string>--service</string></array><key>EnvironmentVariables</key><dict><key>STUDYFOCUS_DATA_DIR</key><string>${serviceDir}</string><key>STUDYFOCUS_SIMULATION</key><string>1</string><key>STUDYFOCUS_TEST_RUN</key><string>1</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>2</integer></dict></plist>`)
 await run('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,plist]);registered=true
 await wait(async()=>{try{return (await request(serviceDir,'state')).health.simulation}catch{return false}},20000)
 const oldPid=Number(fs.readFileSync(path.join(serviceDir,'service.pid'),'utf8'));process.kill(oldPid,'SIGKILL')
 await wait(async()=>{try{const pid=Number(fs.readFileSync(path.join(serviceDir,'service.pid'),'utf8'));return pid!==oldPid&&(await request(serviceDir,'state')).health.engine}catch{return false}},20000)
 console.log(JSON.stringify({ok:true,checks:['native verified app identity','protected app spoof rejection','real disposable app terminated during work','app remains available after emergency','packaged launch-agent startup','service respawn after SIGKILL']}))
}finally{
 if(registered)await run('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`]).catch(()=>{})
 for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')
 await delay(500);fs.rmSync(dir,{recursive:true,force:true})
}
