// GitHub Actions / standby scheduler entry point. A20.2: always DRY RUN until shared delivery ledger exists.
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {writeQueueDays} from "./prepare.mjs";
import {run} from "./deliver.mjs";
const here=dirname(fileURLToPath(import.meta.url));
const date=new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Moscow"}).format(new Date());
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Unexpected Moscow date format: "+date);
const events=JSON.parse(readFileSync(resolve(here,"..","data","events.json"),"utf8"));
const queue=writeQueueDays({start:date,days:7,events,output:resolve(here,"queue")});
const planned=await run({date,now:new Date().toISOString(),live:false});
console.log(JSON.stringify({mode:"A20_SAFE_DRY_RUN",timezone:"Europe/Moscow",today:date,
  sevenDayPlan:queue.map(x=>({date:x.date,events:x.eventCount,posts:x.ready})),
  duePosts:planned.planned.length,
  pendingVideo:planned.pendingVideo,
  note:"No external publication. Enable only after shared ledger and secrets configured."},null,2));
