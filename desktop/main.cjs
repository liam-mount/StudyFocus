const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,dialog,shell,nativeTheme,Notification,protocol,net}=require('electron')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util')
const run=promisify(execFile),request=require('./client.cjs')
const serviceMode=process.argv.includes('--service')
const simulation=process.env.STUDYFOCUS_SIMULATION==='1'
if(app.isPackaged&&simulation&&!process.env.STUDYFOCUS_TEST_RUN){console.error('Simulation requires the test harness.');app.exit(1)}
const dir=process.env.STUDYFOCUS_DATA_DIR||path.join(os.homedir(),'Library','Application Support','StudyFocus')
const root=app.getAppPath(),native=app.isPackaged?path.join(process.resourcesPath,'StudyFocusNative'):path.join(root,'native/build/StudyFocusNative')
app.setPath('userData',path.join(dir,serviceMode?'runtime-service':'runtime-ui'))
app.setName('StudyFocus')
protocol.registerSchemesAsPrivileged([{scheme:'studyfocus',privileges:{standard:true,secure:true,supportFetchAPI:true}}])
let win,tray,quitting=false,lastState=null,polling=false,serviceProcess=null,starting=null,pollTimer
const config=require('../shared/chrome-config.json')
const registration=require('./registration.cjs')
let serviceHandoff=false
async function ensureService(){
 try{await request(dir,'state');return}catch(e){if(e.message.includes('data could not'))throw e}
 if(starting)return starting
 starting=(async()=>{
  const args=app.isPackaged?['--service']:[root,'--service']
  serviceProcess=spawn(process.execPath,args,{detached:true,stdio:'ignore',env:{...process.env,STUDYFOCUS_DATA_DIR:dir,STUDYFOCUS_SIMULATION:simulation?'1':'0'}});serviceProcess.unref()
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,200));try{await request(dir,'state');return}catch(e){if(e.message.includes('data could not'))throw e}}
  throw Error('The background service could not start. Use Repair in Settings.')
 })().finally(()=>{starting=null});return starting
}
async function serviceStatus(){
 if(simulation)return {ok:true,status:'testing',message:'Background setup is isolated in this test run.'}
 if(!app.isPackaged)return {ok:true,status:'development',message:'Development service is running. Install the packaged app to enable login recovery.'}
 return registration.status(native)
}
async function registerService(){
 if(!app.isPackaged||simulation)return serviceStatus()
 const before=await registration.status(native)
 const old=await request(dir,'state').catch(()=>null)
 serviceHandoff=true
 try {
  const result=await registration.install(native,process.execPath)
  if(result.status==='enabled'&&before.status!=='enabled'&&old?.health?.pid){
   try{process.kill(old.health.pid,'SIGTERM')}catch{}
   for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,200));try{await request(dir,'state');break}catch{}}
  }
  return {...result,message:result.status==='requiresApproval'?'Allow StudyFocus in System Settings → General → Login Items & Extensions.':result.message}
 } finally {serviceHandoff=false}
}
function show(){if(!win)createWindow();win.show();win.focus();app.dock?.show()}
function createWindow(){
 win=new BrowserWindow({width:1180,height:820,minWidth:860,minHeight:650,show:false,title:'StudyFocus',titleBarStyle:'hiddenInset',trafficLightPosition:{x:20,y:20},backgroundColor:'#f7f8fa',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(!isTrusted(url))event.preventDefault()})
 win.on('close',event=>{if(!quitting){event.preventDefault();win.hide()}})
 win.on('closed',()=>{win=null})
 win.once('ready-to-show',()=>win.show())
 win.loadURL(process.env.STUDYFOCUS_DEV_URL||'studyfocus://app/index.html')
}
function isTrusted(url){if(url.startsWith('studyfocus://app/'))return true;return !app.isPackaged&&process.env.STUDYFOCUS_DEV_URL&&new URL(url).origin==='http://127.0.0.1:5273'}
function trayMenu(state){
 const s=state?.session;const left=s?Math.max(0,Math.ceil((s.phaseEndsAt-Date.now())/60000)):0
 tray.setTitle(s?`${left}m`:'');tray.setToolTip(s?`StudyFocus · ${s.phase==='break'?'Break':'Focus'} · ${left} min`:'StudyFocus')
 tray.setContextMenu(Menu.buildFromTemplate([{label:s?`${s.phase==='break'?'Break':'Focusing'} · ${left} min remaining`:'Ready when you are',enabled:false},{label:'Open StudyFocus',click:show},...(s?[{label:'Emergency unlock…',click:async()=>{show();const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['Keep focusing','End session and unblock'],defaultId:0,cancelId:0,message:'End this session and unblock your apps and websites?',detail:'This will be recorded as an emergency-ended session.'});if(answer.response===1){try{await request(dir,'emergency');await poll()}catch(e){dialog.showErrorBox('Could not finish unlocking',e.message)}}}}]:[]),{type:'separator'},{label:'Quit StudyFocus window',click:()=>{quitting=true;app.quit()}}]))
}
async function poll(){
 if(polling)return;polling=true
 try{
  const state=await request(dir,'state');nativeTheme.themeSource=state.settings.appearance
  if(lastState&&state.settings.notifications){
   const old=lastState.session,s=state.session
   let title=null,body=''
   if(old&&!s){const h=state.history.find(h=>h.id===old.id);title=h?.outcome==='emergency'?'Session ended':'A little more time, well spent';body=h?.outcome==='emergency'?'Your emergency unlock has been recorded.':'Your focus session is complete.'}
   else if(old&&s&&old.phase!==s.phase){title=s.phase==='break'?'Take a breather':'Time to focus';body=s.phase==='break'?'Your break has started.':'Your next focus round has started.'}
   else if(!old&&s){title='You’re locked in';body=s.label||'Your focus commitment has started.'}
   const latest=state.history[0];if(latest&&latest.id!==lastState.history[0]?.id&&['missed','failed'].includes(latest.outcome)){title=latest.outcome==='missed'?'Scheduled session missed':'Scheduled session could not start';body=latest.detail||''}
   if(title&&Notification.isSupported())new Notification({title,body}).show()
  }
  lastState=state;win?.webContents.send('studyfocus:state',state);trayMenu(state)
 }catch(e){win?.webContents.send('studyfocus:state',{connectionError:e.message});if(!serviceHandoff&&!e.message.includes('data could not'))ensureService().catch(()=>{})}finally{polling=false}
}
const allowed=new Set(['state','apps','start','emergency','emergency.recover','profiles.save','profiles.delete','schedules.save','schedules.delete','settings.save','onboarding.complete','export','importLegacy','service.install','service.repair','service.status','service.uninstall','chrome.install','chrome.openExtension','app.choose','data.open'])
async function command(name,payload){
 if(name==='emergency.recover'){
  const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['Keep focusing','Emergency unlock'],defaultId:0,cancelId:0,message:'End the commitment using emergency recovery?',detail:'Use this if the service is unavailable. Chrome must reconnect to clear browser rules. Your files will be preserved.'})
  if(answer.response!==1)return {ok:false,message:'Recovery cancelled.'}
  const {stdout}=await run(native,['recover'],{env:{...process.env,STUDYFOCUS_DATA_DIR:dir},timeout:10000})
  const result=JSON.parse(stdout);await ensureService().catch(()=>{});return result
 }
 if(name==='service.status')return serviceStatus()
 if(name==='service.install')return registerService()
 if(name==='service.repair'){await ensureService();await request(dir,'system.repair');return app.isPackaged?registerService():{ok:true,message:'The focus service is connected.'}}
 if(name==='service.uninstall'){
  const s=await request(dir,'state');if(s.session||s.schedules.some(x=>x.enabled)||s.health.pendingRelease)throw Error('End the active session, finish releasing website rules, and disable schedules before removing the background service.')
  if(!app.isPackaged)return {ok:false,message:'No login service is installed in development.'}
  return registration.remove(native)
 }
 if(name==='chrome.install'){
  const hosts=path.join(os.homedir(),'Library/Application Support/Google/Chrome/NativeMessagingHosts');fs.mkdirSync(hosts,{recursive:true})
  fs.writeFileSync(path.join(hosts,'com.studyfocus.bridge.json'),JSON.stringify({name:'com.studyfocus.bridge',description:'StudyFocus local browser connection',path:native,type:'stdio',allowed_origins:[`chrome-extension://${config.extensionId}/`]},null,2),{mode:0o600})
  return {ok:true,extensionId:config.extensionId,message:config.storeUrl?'Chrome connection installed. Install the extension to finish setup.':'Chrome connection installed. This beta extension is not yet published. Use Open extension to locate the development extension folder.'}
 }
 if(name==='chrome.openExtension'){
  if(config.storeUrl){await shell.openExternal(config.storeUrl);return {ok:true,message:'Opened the Chrome Web Store listing.'}}
  const extension=app.isPackaged?path.join(process.resourcesPath,'chrome'):path.join(root,'chrome');await shell.openPath(extension)
  return {ok:true,path:extension,message:'Beta setup: open chrome://extensions, enable Developer mode, click Load unpacked, and select this chrome folder. Public installation will use the Chrome Web Store.'}
 }
 if(name==='app.choose'){
  const result=await dialog.showOpenDialog(win,{title:'Choose an application to block',defaultPath:'/Applications',properties:['openFile'],filters:[{name:'Mac applications',extensions:['app']}]})
  if(result.canceled)return null
  const {stdout}=await run(native,['apps',result.filePaths[0]],{maxBuffer:24*1024*1024});const target=JSON.parse(stdout).find(a=>a.bundlePath===fs.realpathSync(result.filePaths[0]));if(!target)throw Error('Choose a valid Mac application.')
  const {protectedApp}=await import(pathToFileURL(path.join(root,'engine/platform.mjs')).href);return {...target,id:target.bundlePath,protected:protectedApp(target)}
 }
 if(name==='export'){
  const data=await request(dir,'export');const result=await dialog.showSaveDialog(win,{title:'Export StudyFocus data',defaultPath:`StudyFocus-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'JSON',extensions:['json']}]})
  if(result.canceled)return {ok:false,message:'Export cancelled.'};fs.writeFileSync(result.filePath,JSON.stringify(data,null,2),{mode:0o600});return {ok:true,message:'Your data has been exported.',path:result.filePath}
 }
 if(name==='data.open'){await shell.openPath(dir);return {ok:true}}
 const result=await request(dir,name,payload);if(name!=='apps')await poll();return result
}
app.whenReady().then(async()=>{
 if(serviceMode){
  app.dock?.hide();app.setActivationPolicy('prohibited')
  const {serve}=await import(pathToFileURL(path.join(root,'engine/service.mjs')).href)
  const service=await serve({dir,native,simulation})
  if(!service){app.exit(0);return}
  app.on('before-quit',()=>service.close());return
 }
 if(!app.requestSingleInstanceLock()){app.quit();return}
 app.on('second-instance',show)
 protocol.handle('studyfocus',request=>{
  const url=new URL(request.url);if(url.hostname!=='app')return new Response('Not found',{status:404})
  const name=decodeURIComponent(url.pathname);const file=path.resolve(root,'dist','.'+name);const base=path.resolve(root,'dist')+path.sep
  if(!file.startsWith(base))return new Response('Not found',{status:404})
  return net.fetch(pathToFileURL(file).href)
 })
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'StudyFocus',submenu:[{role:'about'},{type:'separator'},{label:'Settings…',accelerator:'CmdOrCtrl+,',click:()=>{show();win.webContents.send('studyfocus:state',{navigate:'settings'})}},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'Quit window',accelerator:'CmdOrCtrl+Q',click:()=>{quitting=true;app.quit()}}]},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]))
 const icon=nativeImage.createFromPath(path.join(__dirname,'tray.png'));icon.setTemplateImage(true);tray=new Tray(icon);trayMenu(null)
 ipcMain.handle('studyfocus:command',async(event,name,payload)=>{
  if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||!isTrusted(event.senderFrame.url)||!allowed.has(name))throw Error('This action is not authorized.')
  return command(name,payload)
 })
 createWindow();try{await ensureService();await poll()}catch(e){dialog.showErrorBox('StudyFocus needs attention',e.message)}
 pollTimer=setInterval(poll,1000)
 app.on('activate',show)
})
app.on('window-all-closed',()=>{})
app.on('before-quit',()=>{quitting=true;if(pollTimer)clearInterval(pollTimer)})
