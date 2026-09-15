import {generateKeyPairSync,createHash} from 'node:crypto'
import fs from 'node:fs'
const file='shared/chrome-config.json'
if(!fs.existsSync(file)){
 const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const der=publicKey.export({type:'spki',format:'der'})
 const extensionId=[...createHash('sha256').update(der).digest().subarray(0,16)].map(b=>String.fromCharCode(97+(b>>4),97+(b&15))).join('')
 fs.writeFileSync(file,JSON.stringify({extensionId,key:der.toString('base64'),storeUrl:null},null,2))
}
const config=JSON.parse(fs.readFileSync(file,'utf8'))
fs.writeFileSync('chrome/manifest.json',JSON.stringify({manifest_version:3,name:'StudyFocus — Website Blocker',version:'1.0.0',description:'Applies your StudyFocus commitments to Chrome. Local, private, and connected to your Mac app.',key:config.key,permissions:['declarativeNetRequest','nativeMessaging','storage','alarms','tabs','webNavigation'],background:{service_worker:'background.js',type:'module'},action:{default_popup:'popup.html',default_title:'StudyFocus'},incognito:'spanning',web_accessible_resources:[{resources:['blocked.html','blocked.js','extension.css'],matches:['<all_urls>']}]},null,2))
console.log('Development extension identity:',config.extensionId)
