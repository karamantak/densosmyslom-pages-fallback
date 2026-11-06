// A20.1: deterministic, offline social-content queue. No API calls or secrets.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const here=resolve(fileURLToPath(import.meta.url),"..");
const web=resolve(here,"..");
const MAX_TEXT=3100;
const categoryRank=["Праздники России","Профессиональные праздники","Международные праздники","Народные праздники","Именины","История"];
const clean=s=>String(s||"").replace(/\s+/g," ").trim();
const isoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"));
const sortEvents=(a,b)=>{
  const rank=x=>{const i=categoryRank.indexOf(x.category);return i<0?99:i;};
  return rank(a)-rank(b)||a.category.localeCompare(b.category,"ru")||a.title.localeCompare(b.title,"ru")||a.id.localeCompare(b.id);
};
export function makeDailyQueue(date, allEvents){
  if(!isoDate(date))throw new Error("Expected YYYY-MM-DD date");
  const [year,month,day]=date.split("-").map(Number);
  const candidates=allEvents.filter(e=>
    e.month===month&&e.day===day&&(e.year==null||e.year===year)&&
    e.id&&e.title&&!e.unverified&&e.reviewStatus!=="UNVERIFIED"
  ).sort(sortEvents);
  const seen=new Set();
  const events=candidates.filter(e=>{const k=clean(e.title).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
  const dateLabel=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Moscow"}).format(new Date(date+"T12:00:00Z"));
  const lines=events.map((e,i)=>`${i+1}. ${clean(e.title)}`);
  const heading=`📅 ${dateLabel.replace(/\.$/,"")}. День со смыслом\n\n`;
  const footer="\n\n«День со смыслом» — каждый день интересен.";
  const posts=[];let part=1;let batch=[];
  for(const line of lines){
    const trial=[...batch,line].join("\n");
    if(batch.length&&heading.length+trial.length+footer.length>MAX_TEXT){
      posts.push({id:`${date}:0800:${part++}`,at:`${date}T08:00:00+03:00`,kind:"digest",status:"ready",text:heading+batch.join("\n")+footer});
      batch=[];
    }
    batch.push(line);
  }
  if(batch.length||!posts.length)posts.push({id:`${date}:0800:${part}`,at:`${date}T08:00:00+03:00`,kind:"digest",status:"ready",text:heading+(batch.length?batch.join("\n"):"На эту дату проверенных событий пока нет.")+footer});
  const scored=events.filter(e=>e.category!=="Именины"&&e.category!=="История"&&clean(e.description).length>30);
  const selected=new Set();
  for(const [slot,time,title] of [["1300","13:00","🌤 Событие дня"],["1800","18:00","🌆 Вечерняя история"]]){
    const options=slot==="1300"?[...scored,...events]:[...events.filter(e=>e.category==="История"),...scored,...events];
    const event=options.find(e=>!selected.has(e.id)&&e.category!=="Именины");
    if(!event)continue;
    selected.add(event.id);
    const teaser=clean(event.description||event.history||event.meaning).slice(0,1100);
    posts.push({id:`${date}:${slot}:1`,at:`${date}T${time}:00+03:00`,kind:"feature",status:"ready",eventId:event.id,text:`${title}\n\n${clean(event.title)}\n\n${teaser}\n\n«День со смыслом»`});
  }
  posts.push({id:`${date}:1000:video`,at:`${date}T10:00:00+03:00`,kind:"video",status:"awaiting_video",text:null});
  return {schema:1,date,timezone:"Europe/Moscow",source:"A20 recovered web2/data/events.json",strictMainOnly:true,
    eventCount:events.length,eventIds:events.map(e=>e.id),posts:posts.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id))};
}
export function writeQueueDays({start,days,events,output,force=false}){
  if(!Number.isSafeInteger(days)||days<1||days>31)throw new Error("Days must be 1–31");
  if(!isoDate(start))throw new Error("Invalid start date");
  mkdirSync(output,{recursive:true});
  const files=[];
  for(let i=0;i<days;i++){
    const day=new Date(start+"T12:00:00Z"); day.setUTCDate(day.getUTCDate()+i);
    const date=day.toISOString().slice(0,10);const queue=makeDailyQueue(date,events);
    const path=resolve(output,date+".json");
    const skipped=existsSync(path)&&!force;
    if(!skipped)writeFileSync(path,JSON.stringify(queue,null,2)+"\n","utf8");
    files.push({date,eventCount:queue.eventCount,ready:queue.posts.filter(p=>p.status==="ready").length,waitingVideo:1,preservedExisting:skipped});
  }
  return files;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const flag=name=>args[args.indexOf(name)+1];
  const start=args.includes("--date")?flag("--date"):new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const days=args.includes("--days")?Number(flag("--days")):7;
  const allEvents=JSON.parse(readFileSync(resolve(web,"data","events.json"),"utf8"));
  const output=resolve(here,"queue");
  console.log(JSON.stringify({start,output,days,items:writeQueueDays({start,days,events:allEvents,output,force:args.includes("--force")})},null,2));
}
