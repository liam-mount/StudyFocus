import {spawn} from 'node:child_process'
const vite=spawn('node_modules/.bin/vite',[],{stdio:'inherit'})
await new Promise(r=>setTimeout(r,1000))
const electron=spawn('node_modules/.bin/electron',['.'],{stdio:'inherit',env:{...process.env,STUDYFOCUS_DEV_URL:'http://127.0.0.1:5273'}})
electron.on('exit',()=>{vite.kill();process.exit()})
