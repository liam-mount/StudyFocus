export function normalizeDomain(input) {
 if(typeof input!=='string'||!input.trim()||input.length>2048) return null
 try {
  const url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim())?input.trim():`https://${input.trim()}`)
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password) return null
  const host=url.hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'')
  if(host.length>253||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||/\.(local|localhost|internal)$/.test(host))return null
  if(!host.split('.').every(l=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)))return null
  return host
 }catch{return null}
}
export function hostVariants(domain){return [domain,`www.${domain}`]}
