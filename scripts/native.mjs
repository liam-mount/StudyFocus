import {mkdirSync,existsSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
mkdirSync('native/build',{recursive:true})
const architectures=process.env.TARGET_ARCH?[process.env.TARGET_ARCH==='x64'?'x86_64':'arm64']:['arm64','x86_64']
copyFileSync('native/StudyFocusNative.swift','native/build/main.swift')
for(const arch of architectures)execFileSync('swiftc',['native/build/main.swift','native/Hosts.swift','-O','-target',`${arch}-apple-macosx13.0`,'-module-cache-path','native/build/module-cache','-o',`native/build/StudyFocusNative-${arch}`],{stdio:'inherit'})
execFileSync('lipo',['-create',...architectures.map(a=>`native/build/StudyFocusNative-${a}`),'-output','native/build/StudyFocusNative'],{stdio:'inherit'})
if(existsSync('native/Icon.swift'))execFileSync('swift',['-module-cache-path','native/build/module-cache','native/Icon.swift'],{stdio:'inherit'})
const chunks=[['icp4','16x16'],['icp5','32x32'],['icp6','32x32@2x'],['ic07','128x128'],['ic08','256x256'],['ic09','512x512'],['ic10','512x512@2x']].map(([type,size])=>{const png=readFileSync(`native/build/icon.iconset/icon_${size}.png`);const head=Buffer.alloc(8);head.write(type);head.writeUInt32BE(png.length+8,4);return Buffer.concat([head,png])});const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+chunks.reduce((n,c)=>n+c.length,0),4);writeFileSync('native/build/icon.icns',Buffer.concat([header,...chunks]))
