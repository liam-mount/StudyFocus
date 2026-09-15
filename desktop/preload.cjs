const {contextBridge,ipcRenderer}=require('electron')
const allowed=new Set(['state','apps','start','emergency','emergency.recover','profiles.save','profiles.delete','schedules.save','schedules.delete','settings.save','onboarding.complete','export','importLegacy','service.install','service.repair','service.status','service.uninstall','chrome.install','chrome.openExtension','app.choose','data.open'])
contextBridge.exposeInMainWorld('studyfocus',{
 invoke:(command,payload)=>{if(!allowed.has(command))return Promise.reject(Error('Unsupported action.'));return ipcRenderer.invoke('studyfocus:command',command,payload)},
 subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('studyfocus:state',listener);return()=>ipcRenderer.removeListener('studyfocus:state',listener)}
})
