import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const main=fs.readFileSync('src/scripts/main.ts','utf8');
const source=main.slice(main.indexOf('function initActivityTimer() {'),main.indexOf('function initTelegramAuthAndProfile'));
const events=new Map(), win=new Map(), timers=new Set();let next=0;
const document={hidden:false,querySelector:()=>null,getElementById:()=>null,addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
const context={document,window:{addEventListener:(k,f)=>win.set(k,f),removeEventListener:k=>win.delete(k)},currentUserProfile:null,AbortController,crypto:globalThis.crypto,
 setInterval:()=>{const id=++next;timers.add(id);return id;},clearInterval:id=>timers.delete(id),setTimeout,clearTimeout};
vm.runInNewContext(ts.transpile(source)+';initActivityTimer();',context);
assert.equal(timers.size,1);
for(let i=0;i<20;i++){document.hidden=true;events.get('visibilitychange')();assert.equal(timers.size,0);document.hidden=false;events.get('visibilitychange')();assert.equal(timers.size,1);}
win.get('pagehide')();assert.equal(timers.size,0);win.get('pageshow')();assert.equal(timers.size,1);
events.get('astro:before-swap')();assert.equal(timers.size,0);
console.log('PASS: background suspension, 20 resume cycles without duplicate timers, BFCache resume and cleanup');
