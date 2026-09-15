const call = (name, payload) => {
 if (!window.studyfocus) return Promise.reject(new Error('Open StudyFocus from the Mac application to use this feature.'))
 return window.studyfocus.invoke(name,payload)
}
export const api = {
 state:()=>call('state'), apps:()=>call('apps'), start:(p)=>call('start',p), emergency:()=>call('emergency'), recoverEmergency:()=>call('emergency.recover'),
 saveProfile:(p)=>call('profiles.save',p), deleteProfile:(id)=>call('profiles.delete',{id}),
 saveSchedule:(p)=>call('schedules.save',p), deleteSchedule:(id)=>call('schedules.delete',{id}),
 saveSettings:(p)=>call('settings.save',p), completeOnboarding:()=>call('onboarding.complete'),
 exportData:()=>call('export'),importLegacy:()=>call('importLegacy'),installService:()=>call('service.install'),
 repairService:()=>call('service.repair'),serviceStatus:()=>call('service.status'),installChrome:()=>call('chrome.install'),
 openExtension:()=>call('chrome.openExtension'), chooseApp:()=>call('app.choose'),openData:()=>call('data.open'),
 uninstallService:()=>call('service.uninstall'),
 subscribe:(callback)=>window.studyfocus?.subscribe(callback)??(()=>{})
}
