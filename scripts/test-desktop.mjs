import {_electron as electron} from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studyfocus-ui-'))
const screenshotDir=path.resolve('../qa');fs.mkdirSync(screenshotDir,{recursive:true})
let application
try{
 application=await electron.launch({executablePath:process.env.STUDYFOCUS_APP||require('electron'),args:process.env.STUDYFOCUS_APP?[]:[process.cwd()],env:{...process.env,STUDYFOCUS_DATA_DIR:dir,STUDYFOCUS_SIMULATION:'1',STUDYFOCUS_TEST_RUN:'1'},timeout:30000})
 const window=await application.firstWindow();window.setDefaultTimeout(15000);window.on('pageerror',err=>console.error('RENDERER',err.message))
 await window.waitForSelector('text=Welcome to StudyFocus.',{timeout:30000});await window.getByRole('button',{name:'Let’s begin'}).click()
 await window.waitForSelector('.focus-view',{timeout:15000})
 await window.screenshot({path:path.join(screenshotDir,'focus.png'),fullPage:true})
 for(const [name,selector]of [['Profiles','.profiles-view'],['Schedule','.schedules-view'],['History','.sf-history'],['Settings','.sf-settings']]){
  await window.locator('.sidebar').getByRole('button',{name,exact:true}).click()
  await window.waitForSelector(selector);await window.screenshot({path:path.join(screenshotDir,name.toLowerCase()+'.png'),fullPage:true})
 }
 await window.getByRole('navigation').getByRole('button',{name:'Profiles',exact:true}).click()
 await window.getByRole('button',{name:'New profile',exact:true}).click()
 const modal=window.getByRole('dialog',{name:'New profile'})
 await modal.getByLabel('Profile name').fill('Deep work')
 await modal.getByLabel('Focus (minutes)',{exact:true}).fill('25')
 await modal.getByRole('button',{name:'Test Editor',exact:false}).click()
 await modal.getByRole('button',{name:'Save profile',exact:true}).focus()
 await window.keyboard.press('Tab')
 assert.equal(await modal.getByRole('button',{name:'Close',exact:true}).evaluate(el=>el===document.activeElement),true)
 await modal.getByRole('button',{name:'Save profile',exact:true}).click()
 await modal.waitFor({state:'hidden'})
 await window.getByRole('navigation').getByRole('button',{name:'Schedule',exact:true}).click()
 await window.getByRole('button',{name:'New schedule',exact:true}).click()
 const schedule=window.getByRole('dialog',{name:'New schedule'})
 await schedule.getByLabel('Profile',{exact:true}).selectOption({label:'Deep work'})
 await schedule.getByLabel('Start time').fill('09:00')
 await schedule.getByLabel('Enabled',{exact:true}).uncheck()
 await schedule.getByRole('button',{name:'Save schedule'}).click()
 await schedule.waitFor({state:'hidden'})
 assert.equal((await window.evaluate(()=>window.studyfocus.invoke('state'))).schedules.length,1)
 await window.getByRole('navigation').getByRole('button',{name:'Focus',exact:true}).click()
 await window.locator('.focus-profile-field select').selectOption({label:'Deep work'})
 await window.getByLabel('What will you work on?').fill('Write the next chapter')
 await window.getByRole('button',{name:'Start focus session'}).click()
 await window.getByRole('dialog',{name:'Ready to begin?'}).getByRole('button',{name:'Start session',exact:true}).click()
 const result=await window.evaluate(()=>window.studyfocus.invoke('state'));assert.equal(result.session.label,'Write the next chapter')
 await window.getByRole('navigation').getByRole('button',{name:'Focus',exact:true}).click();await window.waitForSelector('text=Write the next chapter')
 await window.screenshot({path:path.join(screenshotDir,'active.png'),fullPage:true})
 await window.getByRole('button',{name:'Emergency unlock',exact:true}).click()
 await window.getByRole('dialog',{name:'Unlock everything now?'}).getByRole('button',{name:'Unlock now',exact:true}).click()
 await window.waitForSelector('.focus-setup')
 const emergency=await window.evaluate(()=>window.studyfocus.invoke('state'));assert.equal(emergency.session,null);assert.equal(emergency.history[0].outcome,'emergency')
 await window.evaluate(()=>window.studyfocus.invoke('settings.save',{appearance:'dark'}));await window.waitForTimeout(500);await window.screenshot({path:path.join(screenshotDir,'dark.png'),fullPage:true})
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(860,650))
 await window.screenshot({path:path.join(screenshotDir,'compact.png')})
 assert.equal(await window.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
 console.log(JSON.stringify({ok:true,dir,screenshotDir,checks:['onboarding','all views','profile editor and persistence','schedule editor','modal keyboard containment','session confirmation','active view','emergency unlock','dark appearance']}))
}catch(error){if(application){const page=application.windows()[0];if(page){console.error((await page.locator('body').innerText()).slice(-6000));await page.screenshot({path:path.join(screenshotDir,'failure.png')}).catch(()=>{})}}throw error
}finally{
 if(application)await application.close()
 const pidfile=path.join(dir,'service.pid');if(fs.existsSync(pidfile)){try{process.kill(Number(fs.readFileSync(pidfile,'utf8')),'SIGTERM')}catch{}}
}
