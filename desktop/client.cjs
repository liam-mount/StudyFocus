const net=require('node:net'),fs=require('node:fs'),path=require('node:path')
module.exports=function request(dir,command,payload){return new Promise((resolve,reject)=>{
 let token;try{token=fs.readFileSync(path.join(dir,'token'),'utf8').trim()}catch{return reject(Error('Starting the focus service…'))}
 const socket=net.connect(path.join(dir,'engine.sock'));let buffer=''
 socket.setEncoding('utf8');socket.setTimeout(['start','system.repair'].includes(command)?150000:35000,()=>{socket.destroy();reject(Error('The focus service did not respond. Try Repair in Settings.'))})
 socket.once('connect',()=>socket.write(JSON.stringify({token,command,payload})+'\n'))
 socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>24*1024*1024){socket.destroy();reject(Error('Service response too large.'));return};const end=buffer.indexOf('\n');if(end<0)return;socket.destroy();try{const response=JSON.parse(buffer.slice(0,end));if(response.ok)resolve(response.value);else reject(Error(response.error))}catch(e){reject(e)}})
 socket.once('error',()=>reject(Error('The focus service is unavailable. Try Repair in Settings.')))
})}
