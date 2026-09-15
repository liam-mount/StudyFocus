import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import {Repository} from './store.mjs'
import {MacPlatform} from './platform.mjs'
import {Engine} from './core.mjs'
import {HostsController} from './system-sites.mjs'
export async function serve({dir,native,simulation=false}){
 const socket=path.join(dir,'engine.sock');fs.mkdirSync(dir,{recursive:true,mode:0o700})
 if(fs.existsSync(socket)){
  const live=await new Promise(resolve=>{const s=net.connect(socket);s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));s.setTimeout(1000,()=>{s.destroy();resolve(true)})})
  if(live)return null;fs.unlinkSync(socket)
 }
 const tokenPath=path.join(dir,'token');if(!fs.existsSync(tokenPath))fs.writeFileSync(tokenPath,crypto.randomBytes(32).toString('hex'),{mode:0o600});fs.chmodSync(tokenPath,0o600)
 const token=fs.readFileSync(tokenPath,'utf8').trim();let engine=null,fatal=null
 try{engine=new Engine(new Repository(dir),new MacPlatform(native,{simulation}),{hosts:new HostsController(dir,native,{simulation})})}catch(e){fatal=e.message}
 const server=net.createServer(socket=>{
  let buffer='';socket.setEncoding('utf8');socket.setTimeout(15000,()=>socket.destroy())
  socket.on('error',()=>{})
  socket.on('data',async(chunk)=>{
   buffer+=chunk;if(buffer.length>2*1024*1024){socket.destroy();return}
   const index=buffer.indexOf('\n');if(index<0)return
   socket.pause()
   try{
    const req=JSON.parse(buffer.slice(0,index));const input=Buffer.from(String(req.token||'')),expected=Buffer.from(token)
    if(input.length!==expected.length||!crypto.timingSafeEqual(input,expected))throw Error('StudyFocus connection was not authorized.')
    if(fatal)throw Error(fatal)
    socket.setTimeout(['start','system.repair'].includes(req.command)?150000:35000)
    const value=await engine.dispatch(req.command,req.payload)
    socket.end(JSON.stringify({ok:true,value})+'\n')
   }catch(e){socket.end(JSON.stringify({ok:false,error:e.message})+'\n')}
  })
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve)})
 fs.chmodSync(socket,0o600);fs.writeFileSync(path.join(dir,'service.pid'),String(process.pid),{mode:0o600})
 let ticking=false
 const timer=setInterval(async()=>{if(ticking||!engine)return;ticking=true;try{await engine.tick()}catch(e){engine.error=e.message}finally{ticking=false}},1000)
 const close=()=>{clearInterval(timer);server.close();try{fs.unlinkSync(socket)}catch{}}
 return {server,engine,close}
}
