// A20.1: guarded text delivery. LIVE requires BOTH --live and A20_ENABLE_PUBLISH=yes.
// Never store secrets in the repository. Cross-host locking needs a shared ledger before failover activation.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const required=(name)=>{const v=process.env[name];if(!v)throw new Error("Missing "+name);return v;};
const post=async(url,body,headers={})=>{
  const r=await fetch(url,{method:"POST",headers,body,signal:AbortSignal.timeout(12000)});
  const json=await r.json().catch(()=>({}));
  if(!r.ok||json.ok===false||json.error||json.error_code)throw new Error("Remote API rejected request; HTTP "+r.status+", error="+JSON.stringify(json.error||json.description||json.error_code||"unknown").slice(0,250));
  return json;
};
const form=(data)=>new URLSearchParams(data).toString();
export const providers=["telegram","max","vk","ok"];
export async function deliver(platform,text){
  if(platform==="telegram"){
    const token=required("A20_TG_TOKEN"),chat=required("A20_TG_CHAT_ID");
    return post("https://api.telegram.org/bot"+encodeURIComponent(token)+"/sendMessage",
      JSON.stringify({chat_id:chat,text,disable_web_page_preview:true}),{"Content-Type":"application/json"});
  }
  if(platform==="max"){
    const token=required("A20_MAX_TOKEN"),chat=required("A20_MAX_CHAT_ID");
    return post("https://platform-api2.max.ru/messages?chat_id="+encodeURIComponent(chat),
      JSON.stringify({text}),{"Content-Type":"application/json","Authorization":token});
  }
  if(platform==="vk"){
    const token=required("A20_VK_TOKEN"),group=required("A20_VK_GROUP_ID").replace(/^-+/,"");
    return post("https://api.vk.com/method/wall.post",
      form({owner_id:"-"+group,from_group:"1",message:text,access_token:token,v:"5.199"}),
      {"Content-Type":"application/x-www-form-urlencoded"});
  }
  if(platform==="ok"){
    const token=required("A20_OK_TOKEN"),appKey=required("A20_OK_APP_KEY"),secret=required("A20_OK_SESSION_SECRET");
    const args={method:"mediatopic.post",application_key:appKey,format:"json",type:"GROUP_THEME",
      gid:required("A20_OK_GROUP_ID"),attachment:JSON.stringify({media:[{type:"text",text}]})};
    const base=Object.keys(args).sort().map(key=>key+"="+args[key]).join("");
    const sig=createHash("md5").update(base+secret).digest("hex");
    return post("https://api.ok.ru/fb.do",form({...args,access_token:token,sig}),
      {"Content-Type":"application/x-www-form-urlencoded"});
  }
  throw new Error("Unsupported platform: "+platform);
}
export function plan(queue,platform,ledger,nowIso){
  if(!providers.includes(platform))throw new Error("Unknown platform");
  const now=Date.parse(nowIso);
  if(!Number.isFinite(now))throw new Error("Bad time");
  const maxDelayMs=12*60*60*1000; // never flood feeds with old posts after an outage
  return queue.posts.filter(item=>item.kind!=="video"&&item.status==="ready"&&
    Date.parse(item.at)<=now&&now-Date.parse(item.at)<=maxDelayMs&&
    !ledger[platform+":"+item.id]).map(item=>({...item,platform}));
}
export async function run({date,platform="all",live=false,now=new Date().toISOString(),stateDir=resolve(here,"state"),queueDir=resolve(here,"queue")}){
  const queue=JSON.parse(readFileSync(resolve(queueDir,date+".json"),"utf8"));
  const selected=platform==="all"?providers:[platform];
  if(selected.some(p=>!providers.includes(p)))throw new Error("Unknown platform");
  const ledgerPath=resolve(stateDir,"delivery.json");
  const ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,"utf8")):{};
  const tasks=selected.flatMap(p=>plan(queue,p,ledger,now));
  if(!live)return {mode:"dry-run",planned:tasks.map(({platform,id,kind})=>({platform,id,kind})),pendingVideo:queue.posts.filter(p=>p.kind==="video").length};
  if(process.env.A20_ENABLE_PUBLISH!=="yes")throw new Error("Live disabled: A20_ENABLE_PUBLISH must equal yes");
  mkdirSync(stateDir,{recursive:true});
  const result=[];
  for(const task of tasks){
    try{
      const reply=await deliver(task.platform,task.text);
      ledger[task.platform+":"+task.id]={at:new Date().toISOString(),responseId:reply?.result?.message_id??reply?.response?.post_id??reply?.message?.body?.mid??null};
      writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+"\n","utf8");
      result.push({id:task.id,platform:task.platform,status:"sent"});
    }catch(error){
      result.push({id:task.id,platform:task.platform,status:"error",reason:error.message.replace(/bot\d+:[\w-]+/g,"bot[redacted]")});
    }
  }
  return {mode:"live",result};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),val=flag=>args[args.indexOf(flag)+1];
  if(!args.includes("--date"))throw new Error("Use --date YYYY-MM-DD (required)");
  const out=await run({date:val("--date"),platform:args.includes("--platform")?val("--platform"):"all",live:args.includes("--live"),now:args.includes("--now")?val("--now"):new Date().toISOString()});
  console.log(JSON.stringify(out,null,2));
}
