import Foundation
import Darwin

private let beginMarker = "# >>> studyfocus >>> managed automatically — do not edit by hand"
private let endMarker = "# <<< studyfocus <<<"
private var hostsShouldStop = false

func spliceHosts(_ original:String, domains:[String])throws->String {
 var base=original
 if let start=base.range(of:beginMarker) {
  guard let finish=base.range(of:endMarker,range:start.upperBound..<base.endIndex) else {
   throw NSError(domain:"StudyFocus",code:20,userInfo:[NSLocalizedDescriptionKey:"The StudyFocus hosts block is incomplete. Repair it before applying new rules."])
  }
  var end=finish.upperBound
  if end<base.endIndex && base[end]=="\n" {end=base.index(after:end)}
  base.removeSubrange(start.lowerBound..<end)
 }
 if domains.isEmpty{return base}
 let separator=base.isEmpty||base.hasSuffix("\n") ? "":"\n"
 let lines=domains.flatMap{["0.0.0.0 \($0)",":: \($0)","0.0.0.0 www.\($0)",":: www.\($0)"]}.joined(separator:"\n")
 return base+separator+beginMarker+"\n"+lines+"\n"+endMarker+"\n"
}
private func safeDomain(_ s:String)->Bool {
 if s.utf8.count>253||s.hasSuffix(".local")||s.hasSuffix(".localhost")||s.hasSuffix(".internal") || !s.contains("."){return false}
 if s.range(of:"^[0-9.]+$",options:.regularExpression) != nil{return false}
 return s.split(separator:".",omittingEmptySubsequences:false).allSatisfy{part in part.range(of:"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",options:.regularExpression) != nil}
}
private func runSystem(_ exe:String,_ args:[String]){
 let p=Process();p.executableURL=URL(fileURLWithPath:exe);p.arguments=args;p.standardOutput=FileHandle.nullDevice;p.standardError=FileHandle.nullDevice
 do{try p.run();p.waitUntilExit()}catch{}
}
func runHosts(_ directory:String){
 guard getuid()==0 else{die("The system website helper requires administrator approval.")}
 let url=URL(fileURLWithPath:directory).standardizedFileURL
 guard url.resolvingSymlinksInPath().path==url.path,
       url.path.hasPrefix("/Users/"),url.path.hasSuffix("/Library/Application Support/StudyFocus") else{die("Unsupported StudyFocus state directory.")}
 var statbuf=stat();guard lstat(url.path,&statbuf)==0,statbuf.st_uid != 0 else{die("Could not validate the StudyFocus data owner.")}
 let owner=statbuf.st_uid,group=statbuf.st_gid
 let lock=Darwin.open("/var/run/com.studyfocus.hosts.lock",O_CREAT|O_WRONLY|O_NOFOLLOW,mode_t(0o600))
 guard lock>=0 else{die("Could not open the system website lock.")}
 defer{Darwin.close(lock)}
 // The existing helper watches the same user's state and will see updates itself.
 guard flock(lock,LOCK_EX|LOCK_NB)==0 else{exit(0)}
 defer{flock(lock,LOCK_UN)}
 let sessionPath=url.appendingPathComponent("hosts-session.json").path
 let statusPath=url.appendingPathComponent("hosts-status.json")
 func status(_ sessionId:String?,_ armed:Bool,_ error:String?=nil){
  var value:[String:Any] = ["at":Date().timeIntervalSince1970*1000,"armed":armed,"pid":Int(getpid())]
  if let sessionId{value["sessionId"]=sessionId};if let error{value["error"]=error}
  do {
   let tmp=url.appendingPathComponent(".hosts-status-"+UUID().uuidString)
   let data=try JSONSerialization.data(withJSONObject:value)
   try data.write(to:tmp,options:.withoutOverwriting)
   chmod(tmp.path,mode_t(0o600));chown(tmp.path,owner,group)
   if rename(tmp.path,statusPath.path) != 0{try? FileManager.default.removeItem(at:tmp)}
  }catch{}
 }
 func apply(_ domains:[String])throws{
  let target="/etc/hosts"
  let original=try String(contentsOfFile:target,encoding:.utf8)
  let next=try spliceHosts(original,domains:domains)
  if original==next{return}
  // Preserve all bytes outside the marked section, including concurrent unrelated edits.
  let tmp="/etc/.studyfocus-hosts-"+UUID().uuidString
  let data=Data(next.utf8)
  try data.write(to:URL(fileURLWithPath:tmp),options:.withoutOverwriting)
  chmod(tmp,mode_t(0o644));chown(tmp,0,0)
  guard rename(tmp,target)==0 else{try? FileManager.default.removeItem(atPath:tmp);throw NSError(domain:"StudyFocus",code:21)}
  runSystem("/usr/bin/dscacheutil",["-flushcache"]);runSystem("/usr/bin/killall",["-HUP","mDNSResponder"])
 }
 signal(SIGTERM){_ in hostsShouldStop=true};signal(SIGINT){_ in hostsShouldStop=true}
 var sessionId:String?=nil
 do {
  while !hostsShouldStop {
   if FileManager.default.fileExists(atPath:url.appendingPathComponent("emergency-unlock.json").path){break}
   var info=stat()
   guard lstat(sessionPath,&info)==0 else{break}
   guard info.st_uid==owner,(info.st_mode & S_IFMT)==S_IFREG,info.st_size<=1024*1024 else{throw NSError(domain:"StudyFocus",code:22)}
   let raw=try Data(contentsOf:URL(fileURLWithPath:sessionPath))
   guard let s=try JSONSerialization.jsonObject(with:raw) as? [String:Any],let id=s["id"] as? String,
    let started=s["startedAt"] as? Double,let work=s["workMs"] as? Double,let rest=s["breakMs"] as? Double,
    let rounds=s["rounds"] as? Int,let domains=s["siteBlocklist"] as? [String],domains.count<=500,
    domains.allSatisfy(safeDomain),started.isFinite,work.isFinite,rest.isFinite,
    work>=60000,work<=480*60000,rest>=0,rest<=60*60000,rounds>=1,rounds<=12 else{throw NSError(domain:"StudyFocus",code:23)}
   sessionId=id
   let pomo=(s["mode"] as? String)=="pomodoro"
   let total=pomo ? Double(rounds)*work+Double(rounds-1)*rest:work
   let now=Date().timeIntervalSince1970*1000
   guard total<=86400000,started<=now+60000 else{throw NSError(domain:"StudyFocus",code:24)}
   if now>=started+total{break}
   let elapsed=max(0,now-started),active = !pomo || elapsed.truncatingRemainder(dividingBy:work+rest)<work
   try apply(active ? domains:[]);status(id,active && !domains.isEmpty)
   Thread.sleep(forTimeInterval:1)
  }
  try apply([]);status(sessionId,false)
 }catch{
  do{try apply([]);status(sessionId,false,error.localizedDescription)}catch{status(sessionId,true,"System website cleanup needs administrator repair.")}
 }
}
