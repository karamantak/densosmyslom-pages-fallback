import test, {after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {makeDailyQueue} from "./prepare.mjs";
import {plan,providers,run} from "./deliver.mjs";
const base=resolve(fileURLToPath(import.meta.url),"..");
const events=JSON.parse(readFileSync(resolve(base,"..","data","events.json"),"utf8"));
const testQueue=mkdtempSync(resolve(tmpdir(),"a20-social-"));
writeFileSync(resolve(testQueue,"2026-11-06.json"),JSON.stringify(makeDailyQueue("2026-11-06",events)));
after(()=>rmSync(testQueue,{recursive:true,force:true}));
test("A20: queue reproducible, no unverified extras",()=>{
  const date="2026-11-06";
  const a=makeDailyQueue(date,events),b=makeDailyQueue(date,events);
  assert.deepEqual(a,b);
  assert.equal(a.strictMainOnly,true);
  assert.ok(a.eventCount>0);
  assert.ok(a.posts.every(p=>p.id.startsWith(date+":")));
  assert.equal(a.posts.filter(p=>p.kind==="video").length,1);
  assert.ok(a.posts.filter(p=>p.kind!=="video").every(p=>p.text.length<=4096));
  const ids=new Set(a.posts.map(p=>p.id));
  assert.equal(ids.size,a.posts.length);
  const features=a.posts.filter(p=>p.kind==="feature");
  assert.equal(new Set(features.map(p=>p.eventId)).size,features.length);
  assert.ok(!a.posts[0].text.includes("г.."));
});
test("A20: all main events included in morning digest",()=>{
  const q=makeDailyQueue("2026-11-06",events);
  const morning=q.posts.filter(p=>p.kind==="digest").map(p=>p.text).join("\n");
  const matched=events.filter(e=>q.eventIds.includes(e.id));
  for(const e of matched)assert.ok(morning.includes(e.title.replace(/\s+/g," ").trim()),"Missing "+e.id);
});
test("A20: dry run no network, respects time and per-platform ledger",async()=>{
  const q=makeDailyQueue("2026-11-06",events),cutoff="2026-11-06T12:01:00Z";
  const before=plan(q,"telegram",{},cutoff);
  assert.ok(before.length>=2);
  assert.ok(before.every(p=>p.status==="ready"));
  assert.equal(plan(q,"telegram",{["telegram:"+before[0].id]:{at:"sent"}},cutoff).length,before.length-1);
  assert.equal(plan(q,"vk",{}, "2026-11-05T12:00:00Z").length,0);
  assert.equal(providers.length,4);
  const result=await run({date:"2026-11-06",now:"2026-11-06T20:00:00Z",stateDir:resolve(testQueue,"state"),queueDir:testQueue});
  assert.equal(result.mode,"dry-run");
  assert.ok(result.planned.length>=8);
  assert.equal(result.pendingVideo,1);
  assert.equal(plan(q,"telegram",{},"2026-11-08T20:00:00Z").length,0);
});
test("A20: no live posting without explicit env guard",async()=>{
  const old=process.env.A20_ENABLE_PUBLISH;
  delete process.env.A20_ENABLE_PUBLISH;
  try{await assert.rejects(()=>run({date:"2026-11-06",live:true,now:"2026-11-06T20:00:00Z",stateDir:resolve(testQueue,"state"),queueDir:testQueue}),/Live disabled/);}
  finally{if(old!==undefined)process.env.A20_ENABLE_PUBLISH=old;}
});
