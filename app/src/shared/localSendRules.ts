/* FusionIsland - GPL-3.0. @file localSendRules.ts @description Bounded LocalSend metadata and file names. @author 鸡哥 */
/** Accepts LAN IPv4 and local IPv6 literals, excluding public destinations. */
export function isLocalAddress(raw:string):boolean {
 const value=raw.replace(/^::ffff:/,'').toLowerCase();
 if(value==='::1'||/^(fc|fd)[\da-f]{2}:/.test(value)||/^fe[89ab][\da-f]:/.test(value))return true;
 if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))return false;
 const p=value.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 return p[0]===10||p[0]===127||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===169&&p[1]===254;
}
/** Requires a safe Windows basename without traversal or device names. */
export function safeReceiveName(value:string):string {
 if(typeof value!=='string'||!value||value.length>180||/[<>:"/\\|?*\x00-\x1f]/.test(value)||/[. ]$/.test(value)||/^\.{1,2}$/.test(value)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw Error('invalid-file-name');return value;
}
