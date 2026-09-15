import {chromium} from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {serve} from '../engine/service.mjs'
const dir=fs.mkdtempSync('/tmp/studyfocus-chrome-'),fixture=path.join(dir,'extension')
fs.cpSync('chrome',fixture,{recursive:true});const bg=path.join(fixture,'background.js');fs.writeFileSync(bg,fs.readFileSync(bg,'utf8').replaceAll('com.studyfocus.bridge','com.studyfocus.test'))
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'manifest.json'),'utf8'));manifest.permissions.push('declarativeNetRequestFeedback');fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify(manifest))
const native=path.resolve('native/build/StudyFocusNative')
const registrations=[];let context,service
const wait=async(fn,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(200)}throw Error('Condition timed out')}
try{
 // Dedicated test host name; never replace the user's real StudyFocus registration.
 const hostDir=path.join(dir,'profile','NativeMessagingHosts');fs.mkdirSync(hostDir,{recursive:true})
 const file=path.join(hostDir,'com.studyfocus.test.json')
 const extensionId=JSON.parse(fs.readFileSync('shared/chrome-config.json','utf8')).extensionId
 fs.writeFileSync(file,JSON.stringify({name:'com.studyfocus.test',description:'Temporary StudyFocus test connection',path:native,type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]}),{mode:0o600});registrations.push(file)
 service=await serve({dir,native,simulation:false})
 context=await chromium.launchPersistentContext(path.join(dir,'profile'),{headless:false,env:{...process.env,STUDYFOCUS_DATA_DIR:dir},args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]})
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000})
 worker.on('console',msg=>console.log('EXT',msg.text()))
 await wait(()=>service.engine.chromeClients().length>0)
 const s=await service.engine.dispatch('start',{mode:'focus',workMin:1,breakMin:5,rounds:1,apps:[],sites:['example.com'],label:'Chrome integration test'})
 assert.ok(s.session)
 await wait(()=>service.engine.snapshot().health.chromeReady)
 const ruleState=await worker.evaluate(async()=>({rules:await chrome.declarativeNetRequest.getDynamicRules(),status:await chrome.storage.local.get('status')}));assert.equal(ruleState.rules.length,1)
 const match=await worker.evaluate(async()=>({blocked:await chrome.declarativeNetRequest.testMatchOutcome({url:'https://sub.example.com/a',type:'main_frame'}),allowed:await chrome.declarativeNetRequest.testMatchOutcome({url:'https://notexample.com/a',type:'main_frame'})}));assert.equal(match.blocked.matchedRules.length,1);assert.equal(match.allowed.matchedRules.length,0)
 const page=await context.newPage();await page.goto('https://example.com/').catch(()=>{});await wait(()=>page.url().includes('blocked.html'))
 await page.screenshot({path:path.resolve('../qa/chrome-blocked.png')})
 await service.engine.dispatch('emergency');await wait(async()=>!(await worker.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length)
 assert.equal(service.engine.data.history[0].outcome,'emergency')
 await wait(()=>!service.engine.data.pendingRelease)
 // Persist a deliberately expired policy; a browser restart must reconcile stale rules.
 await worker.evaluate(async()=>{const policy={revision:'expired-test',session:{id:'expired-test',startedAt:Date.now()-120000,endsAt:Date.now()-60000,mode:'focus',workMs:60000,breakMs:0,rounds:1,sites:['example.com']}};await chrome.storage.local.set({policy});await chrome.declarativeNetRequest.updateDynamicRules({addRules:[{id:1,priority:1,action:{type:'block'},condition:{requestDomains:['example.com'],resourceTypes:['main_frame']}}]})})
 await context.close();context=null
 context=await chromium.launchPersistentContext(path.join(dir,'profile'),{headless:false,env:{...process.env,STUDYFOCUS_DATA_DIR:dir},args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]})
 const restarted=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker')
 await wait(async()=>!(await restarted.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length)
 await wait(()=>!service.engine.data.pendingRelease&&service.engine.chromeClients().some(c=>c.revision===service.engine.policy().revision))
 await service.engine.dispatch('start',{mode:'focus',workMin:1,breakMin:5,rounds:1,apps:[],sites:['example.com'],label:'Offline recovery test'})
 await wait(async()=>(await restarted.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length===1)
 service.close();service=null
 execFileSync(native,['recover'],{env:{...process.env,STUDYFOCUS_DATA_DIR:dir}})
 await wait(async()=>!(await restarted.evaluate(()=>chrome.declarativeNetRequest.getDynamicRules())).length)
 service=await serve({dir,native,simulation:false})
 await wait(()=>service.engine.data.session===null)
 assert.equal(service.engine.data.history.at(-1).outcome,'emergency')
 console.log(JSON.stringify({ok:true,checks:['native handshake','verified session start','Chrome DNR exact/subdomain blocking','deceptive sibling allowed','blocked navigation page','emergency rule cleanup','stale rules cleaned on browser restart','emergency Chrome cleanup without engine','recovery outcome reconciled after engine restart']}))
}catch(e){if(context){try{const workers=context.serviceWorkers();console.error('WORKERS',workers.map(w=>w.url()));if(workers[0]){console.error('EXT_STATE',await workers[0].evaluate(()=>chrome.storage.local.get(null)));console.error('NATIVE_DIAGNOSTIC',await workers[0].evaluate(()=>new Promise(resolve=>{const p=chrome.runtime.connectNative('com.studyfocus.test');p.onMessage.addListener(m=>{resolve(m);p.disconnect()});p.onDisconnect.addListener(()=>resolve(chrome.runtime.lastError?.message||'disconnected'));p.postMessage({id:'diagnostic-client',revision:''});setTimeout(()=>resolve('no response'),4000)})))}}catch{}}throw e}
finally{await context?.close();service?.close();for(const file of registrations)fs.rmSync(file,{force:true});fs.rmSync(dir,{recursive:true,force:true})}
