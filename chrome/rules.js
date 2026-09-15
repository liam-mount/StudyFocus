export function phase(policy,now=Date.now()){
 const s=policy?.session;if(!s||now>=s.endsAt)return {work:false,next:null}
 if(now<s.startedAt)return {work:false,next:s.startedAt}
 if(s.mode!=='pomodoro')return {work:true,next:s.endsAt}
 const cycle=s.workMs+s.breakMs;const within=(now-s.startedAt)%cycle
 const work=within<s.workMs
 return {work,next:Math.min(s.endsAt,now+(work?s.workMs-within:cycle-within))}
}
export function rulesFor(policy,now=Date.now()){
 if(!phase(policy,now).work)return []
 return policy.session.sites.map((domain,i)=>({id:i+1,priority:1,action:{type:'block'},condition:{requestDomains:[domain],resourceTypes:['main_frame','sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','csp_report','media','websocket','other']}}))
}
export function matches(url,sites){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&sites.some(s=>u.hostname===s||u.hostname.endsWith('.'+s))}catch{return false}}
