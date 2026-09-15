import Foundation
import AppKit
import ServiceManagement
import Darwin

func output(_ value: Any) { let data = try! JSONSerialization.data(withJSONObject:value, options:[.sortedKeys]); FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10])) }
func die(_ message:String)->Never { FileHandle.standardError.write(Data(message.utf8)); exit(1) }
func canonicalURL(_ url:URL)->URL {
 guard let resolved=Darwin.realpath(url.path,nil) else{return url.resolvingSymlinksInPath()}
 defer{free(resolved)};return URL(fileURLWithPath:String(cString:resolved))
}
func appRecord(_ url:URL, icons:Bool=true)->[String:Any]? {
 let real=canonicalURL(url); guard real.pathExtension=="app",let bundle=Bundle(url:real),let bid=bundle.bundleIdentifier else{return nil}
 var rec:[String:Any] = ["name":bundle.object(forInfoDictionaryKey:"CFBundleDisplayName") as? String ?? bundle.object(forInfoDictionaryKey:"CFBundleName") as? String ?? real.deletingPathExtension().lastPathComponent,"bundleId":bid,"bundlePath":real.path]
 if icons,let iconFile=bundle.object(forInfoDictionaryKey:"CFBundleIconFile") as? String {
  let iconURL=real.appendingPathComponent("Contents/Resources").appendingPathComponent(iconFile.hasSuffix(".icns") ? iconFile:iconFile+".icns")
  if let image=NSImage(contentsOf:iconURL),let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:40,pixelsHigh:40,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0){
   NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
   image.draw(in:NSRect(x:0,y:0,width:40,height:40));NSGraphicsContext.restoreGraphicsState()
   if let png=rep.representation(using:.png,properties:[:]){rec["icon"]="data:image/png;base64,"+png.base64EncodedString()}
  }
 };return rec
}
func readExactly(_ count:Int)->Data? {var data=Data();while data.count<count{guard let chunk=try? FileHandle.standardInput.read(upToCount:count-data.count),!chunk.isEmpty else{return nil};data.append(chunk)};return data}
func request(_ value:[String:Any], dir:String)throws->Data {
 let token=try String(contentsOfFile:dir+"/token",encoding:.utf8).trimmingCharacters(in:.whitespacesAndNewlines)
 var req=value;req["token"]=token
 let data=try JSONSerialization.data(withJSONObject:req)+Data([10])
 let fd=Darwin.socket(AF_UNIX,SOCK_STREAM,0);guard fd>=0 else{throw NSError(domain:"StudyFocus",code:1)};defer{Darwin.close(fd)}
 var timeout=timeval(tv_sec:10,tv_usec:0);setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size))
 var addr=sockaddr_un();addr.sun_family=sa_family_t(AF_UNIX)
 let bytes=Array((dir+"/engine.sock").utf8CString)
 guard bytes.count<=MemoryLayout.size(ofValue:addr.sun_path) else{throw NSError(domain:"StudyFocus",code:2)}
 withUnsafeMutablePointer(to:&addr.sun_path){ptr in ptr.withMemoryRebound(to:CChar.self,capacity:bytes.count){dest in for i in 0..<bytes.count{dest[i]=bytes[i]}}}
 let result=withUnsafePointer(to:&addr){ptr in ptr.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.connect(fd,$0,socklen_t(MemoryLayout<sockaddr_un>.size))}}
 guard result==0 else{throw NSError(domain:"StudyFocus",code:3,userInfo:[NSLocalizedDescriptionKey:"Open StudyFocus to reconnect."])}
 var sent=0;try data.withUnsafeBytes{raw in while sent<data.count{let n=Darwin.write(fd,raw.baseAddress!.advanced(by:sent),data.count-sent);if n<=0{throw NSError(domain:"StudyFocus",code:4)};sent+=n}}
 var received=Data();var buffer=[UInt8](repeating:0,count:8192)
 while received.count<8*1024*1024{let n=Darwin.read(fd,&buffer,buffer.count);if n<=0{break};received.append(contentsOf:buffer[0..<n]);if let end=received.firstIndex(of:10){return received[..<end]}}
 throw NSError(domain:"StudyFocus",code:5,userInfo:[NSLocalizedDescriptionKey:"StudyFocus did not respond."])
}
func nativeMessage(_ dir:String){
 while let header=readExactly(4){let count=header.enumerated().reduce(0){$0 | Int($1.element)<<($1.offset*8)};if count<1||count>1024*1024{return};guard let data=readExactly(count) else{return}
  var response:[String:Any]
  do {guard let payload=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{throw NSError(domain:"StudyFocus",code:1)}
   let recovery=URL(fileURLWithPath:dir).appendingPathComponent("emergency-unlock.json")
   let raw:Data
   if FileManager.default.fileExists(atPath:recovery.path) {
    raw=try JSONSerialization.data(withJSONObject:["ok":true,"value":["revision":"emergency-recovery","now":Date().timeIntervalSince1970*1000,"session":NSNull()]])
   }else{raw=try request(["command":"chrome.sync","payload":payload],dir:dir)}
   guard let obj=try JSONSerialization.jsonObject(with:raw) as? [String:Any] else{throw NSError(domain:"StudyFocus",code:1)}
   response=obj
  }catch{response=["ok":false,"error":error.localizedDescription]}
  guard let body=try? JSONSerialization.data(withJSONObject:response) else{return};var length=UInt32(body.count).littleEndian
  FileHandle.standardOutput.write(Data(bytes:&length,count:4));FileHandle.standardOutput.write(body)
 }
}
let args=Array(CommandLine.arguments.dropFirst());let command=args.first ?? ""
let dir=ProcessInfo.processInfo.environment["STUDYFOCUS_DATA_DIR"] ?? NSHomeDirectory()+"/Library/Application Support/StudyFocus"
switch command {
case "recover":
 do {
  let base=URL(fileURLWithPath:dir)
  try FileManager.default.createDirectory(at:base,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
  let marker=base.appendingPathComponent("emergency-unlock.json")
  let body=try JSONSerialization.data(withJSONObject:["at":Date().timeIntervalSince1970*1000])
  try body.write(to:marker,options:.atomic);chmod(marker.path,mode_t(0o600))
  try? FileManager.default.removeItem(at:base.appendingPathComponent("hosts-session.json"))
  output(["ok":true,"message":"Emergency recovery requested. Keep Chrome open so its rules can clear. Repair the service to reconcile local history."])
 }catch{die(error.localizedDescription)}
case "hosts":
 guard args.count==2 else{die("Missing StudyFocus directory.")};runHosts(args[1])
case "hosts-preview":
 let data=FileHandle.standardInput.readDataToEndOfFile()
 do{let v=try JSONSerialization.jsonObject(with:data) as! [String:Any];output(["text":try spliceHosts(v["text"] as! String,domains:v["domains"] as! [String])])}catch{die(error.localizedDescription)}
case "apps":
 let roots=["/Applications","/Applications/Utilities","/System/Applications","/System/Applications/Utilities",NSHomeDirectory()+"/Applications"]
 var paths=Set(args.dropFirst().filter{$0.hasSuffix(".app")})
 for root in roots {for name in (try? FileManager.default.contentsOfDirectory(atPath:root)) ?? [] where name.hasSuffix(".app"){paths.insert(root+"/"+name)}}
 output(paths.compactMap{appRecord(URL(fileURLWithPath:$0))}.sorted{String(describing:$0["name"]!).localizedCaseInsensitiveCompare(String(describing:$1["name"]!)) == .orderedAscending})
case "terminate":
 guard args.count==5,let pid=Int32(args[1]),let app=NSRunningApplication(processIdentifier:pid),let url=app.bundleURL,let rec=appRecord(url,icons:false) else{output(["closed":false]);exit(0)}
 let real=canonicalURL(url).path,bid=app.bundleIdentifier ?? "",name=rec["name"] as? String ?? ""
 let protected:Set<String>=["com.apple.finder","com.apple.Terminal","com.googlecode.iterm2","com.apple.systempreferences","com.apple.ActivityMonitor","com.apple.MobileSMS","com.apple.FaceTime","com.apple.Maps","com.apple.AddressBook","com.apple.Console","com.apple.ScreenSharing","com.apple.loginwindow","com.studyfocus.desktop"]
 let names:Set<String>=["Finder","Terminal","iTerm","iTerm2","System Settings","System Preferences","Activity Monitor","Messages","FaceTime","Phone","Maps","Contacts","Console","StudyFocus","StudyFocusNative","Electron"]
 guard real==args[2],bid==args[3],!protected.contains(bid),!names.contains(name),!bid.hasPrefix("com.studyfocus."),!real.hasPrefix("/System/") else{die("The application identity changed or is protected.")}
 output(["closed":args[4]=="force" ? app.forceTerminate():app.terminate()])
case "running":
 output(NSWorkspace.shared.runningApplications.compactMap{a -> [String:Any]? in guard let url=a.bundleURL,var rec=appRecord(url,icons:false) else{return nil};rec["pid"]=Int(a.processIdentifier);return rec})
case "register", "unregister", "status":
 if #available(macOS 13.0,*) {
  let service=SMAppService.agent(plistName:"com.studyfocus.engine.plist")
  do {if command=="register"{try service.register()};if command=="unregister"{try service.unregister()}
   let labels:[SMAppService.Status:String]=[.notRegistered:"notRegistered",.enabled:"enabled",.requiresApproval:"requiresApproval",.notFound:"notFound"]
   output(["ok":true,"status":labels[service.status] ?? "unknown"])
  }catch{output(["ok":false,"status":String(describing:service.status),"message":error.localizedDescription])}
 }else{output(["ok":false,"status":"unsupported","message":"macOS 13 or later is required."])}
case "native": nativeMessage(dir)
default:
 // Chrome calls the registered native host with the chrome-extension:// origin as its first argument.
 if command.hasPrefix("chrome-extension://"){nativeMessage(dir)}else{die("Unknown StudyFocus native command.")}
}
