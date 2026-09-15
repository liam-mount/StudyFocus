import {phase,rulesFor,matches} from './rules.js'
let port=null,policy=null,clientId=null,revision='',error='',syncing=false,queue=Promise.resolve(),restored={}
const exclusive=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task}
async function initialize(){
 const stored=await chrome.storage.local.get(['clientId','policy','restored'])
 clientId=stored.clientId||crypto.randomUUID();policy=stored.policy||null;restored=stored.restored||{}
 await chrome.storage.local.set({clientId});await apply();connect()
 await chrome.alarms.create('reconcile',{periodInMinutes:0.5})
}
async function apply(){return exclusive(async()=>{
 const appliedPolicy=policy
 const desired=rulesFor(appliedPolicy),current=await chrome.declarativeNetRequest.getDynamicRules()
 const equal=JSON.stringify(current)===JSON.stringify(desired)
 if(!equal)await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:current.map(r=>r.id),addRules:desired})
 const p=phase(appliedPolicy)
 await chrome.alarms.clear('boundary')
 if(p.next)await chrome.alarms.create('boundary',{when:p.next})
 if(p.work){
  for(const tab of await chrome.tabs.query({}))if(tab.id&&matches(tab.url,appliedPolicy.session.sites))await shield(tab.id,tab.url)
 }else{
  for(const [id,url]of Object.entries(restored)){
   try{const tab=await chrome.tabs.get(Number(id));if(tab.url?.startsWith(chrome.runtime.getURL('blocked.html')))await chrome.tabs.update(Number(id),{url})}catch{}
  }restored={};await chrome.storage.local.set({restored})
 }
 revision=appliedPolicy?.revision||''
 await chrome.storage.local.set({policy:appliedPolicy,status:{connected:!!port,revision,error,phase:p.work?'work':p.next?'break':'idle',endsAt:appliedPolicy?.session?.endsAt||null}})
 await chrome.action.setBadgeText({text:p.work?'ON':''});await chrome.action.setBadgeBackgroundColor({color:'#4776df'})
})}
async function shield(id,url){
 restored[id]=url;await chrome.storage.local.set({restored})
 try{await chrome.tabs.update(id,{url:chrome.runtime.getURL('blocked.html')+'?host='+encodeURIComponent(new URL(url).hostname)})}catch{}
}
function heartbeat(){
 if(!port||syncing)return
 syncing=true
 chrome.extension.isAllowedIncognitoAccess(incognito=>{
  try{port.postMessage({id:clientId,name:'Chrome profile',revision,incognito,error})}catch{syncing=false;port=null}
 })
}
function connect(){
 if(port)return
 try{
  port=chrome.runtime.connectNative('com.studyfocus.bridge')
  port.onMessage.addListener(async response=>{
   syncing=false
   if(!response.ok){error=response.error||'Open StudyFocus to reconnect.';await chrome.storage.local.set({status:{connected:false,error}});return}
   policy=response.value;error=''
   try{await apply()}catch(e){error=e.message;await chrome.storage.local.set({status:{connected:true,error}})}
  })
  port.onDisconnect.addListener(()=>{const reason=chrome.runtime.lastError?.message;port=null;syncing=false;error=reason||'Open StudyFocus to reconnect.';chrome.storage.local.set({status:{connected:false,error:reason||'Open StudyFocus to reconnect.'}});setTimeout(connect,2000)})
  heartbeat()
 }catch{port=null}
}
chrome.alarms.onAlarm.addListener(async()=>{try{await apply()}catch(e){error=e.message};connect();heartbeat()})
chrome.webNavigation.onBeforeNavigate.addListener(details=>{
 if(details.frameId===0&&phase(policy).work&&matches(details.url,policy.session.sites))shield(details.tabId,details.url).catch(()=>{})
})
chrome.tabs.onRemoved.addListener(id=>{delete restored[id];chrome.storage.local.set({restored})})
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message.type==='status'){chrome.storage.local.get(['status','policy']).then(respond);return true}
 if(message.type==='reconnect'){connect();heartbeat();respond({ok:true})}
})
setInterval(()=>{connect();heartbeat()},2000)
initialize().catch(async e=>{error=e.message;await chrome.storage.local.set({status:{connected:false,error}})})
