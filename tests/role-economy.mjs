import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('schema.sql','utf8'));
const add=db.prepare("INSERT INTO users(telegram_id,username,tokens,created_at,last_login_at) VALUES(?,?,?,'2026-11-01','2026-11-01')");
add.run('123','rider',1000);add.run('456','other',30);
db.prepare("INSERT INTO profile_purchases VALUES('123','role-night','role','NIGHT SHIFT',450,'2026-11-01')").run();
db.exec(fs.readFileSync('migrations/0005_role_economy.sql','utf8'));
for(const name of ['0006_web_achievements.sql']) db.exec(fs.readFileSync('migrations/'+name,'utf8'));
assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_roles').get().n,10);
assert.equal(db.prepare("SELECT balance FROM users WHERE telegram_id='123'").get().balance,550);
assert.equal(db.prepare('SELECT COUNT(*) n FROM user_roles').get().n,1);
const source=fs.readFileSync('public/_worker.js','utf8').replace('./subscriber-cache.mjs', pathToFileURL('public/subscriber-cache.mjs').href)+'\nexport {handleRoleEconomy,createProfileSession,handleShopOrder,readProgressProfile,handleProfile,handleJetActivity};';
const {handleRoleEconomy,createProfileSession,handleShopOrder,readProgressProfile,handleProfile,handleJetActivity}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={DB:{prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)}},all:async()=>({results:db.prepare(sql).all()}),first:async()=>db.prepare(sql).get()??null};}}};
const token='test-token';const cookie=(await createProfileSession('123',token)).split(';')[0];
async function call(path,body,authenticated=true){return handleRoleEconomy(new Request('https://shop.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authenticated?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,token);}
assert.equal((await call('/api/shop/roles')).status,200);
assert.equal((await call('/api/shop/buy-role',{telegram_id:'123',role_id:'role-spark'},false)).status,401);
assert.equal((await call('/api/user/profile?telegram_id=456')).status,403);
assert.equal((await call('/api/shop/buy-role',{telegram_id:'456',role_id:'role-spark'})).status,403);
let response=await call('/api/shop/buy-role',{role_id:'role-spark',price:1});assert.equal(response.status,200);
let wallet=await response.json();assert.equal(wallet.balance,450);assert.equal(wallet.transactions[0].amount,-100);assert.equal(wallet.transactions[0].type,'purchase_role');
assert.equal((await call('/api/shop/buy-role',{role_id:'role-spark'})).status,409);
assert.equal((await call('/api/shop/buy-role',{role_id:'role-exclusive'})).status,409);
assert.equal((await call('/api/shop/buy-role',{role_id:'missing'})).status,404);
assert.equal(db.prepare("SELECT balance FROM users WHERE telegram_id='123'").get().balance,450);
// A journal write failure must roll back both ownership and debit.
db.exec("CREATE TRIGGER fail_ledger BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT,'test failure'); END;");
assert.throws(()=>db.prepare("INSERT INTO user_roles(telegram_id,role_id) VALUES('123','role-street')").run());
assert.equal(db.prepare("SELECT balance FROM users WHERE telegram_id='123'").get().balance,450);
assert.equal(db.prepare("SELECT COUNT(*) n FROM user_roles WHERE role_id='role-street'").get().n,0);
db.exec('DROP TRIGGER fail_ledger');
const results=await Promise.all([call('/api/shop/buy-role',{role_id:'role-street'}),call('/api/shop/buy-role',{role_id:'role-street'})]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
assert.equal(db.prepare("SELECT balance FROM users WHERE telegram_id='123'").get().balance,400);
db.prepare("UPDATE users SET tokens=tokens+50 WHERE telegram_id='123'").run();
assert.equal(db.prepare("SELECT amount FROM transactions ORDER BY id DESC LIMIT 1").get().amount,50);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
console.log('PASS: migration, legacy balances, 10 roles, auth, spoofing, authoritative price, duplicate/concurrent requests, insufficient funds, atomic rollback, ledger');

const xpBefore=db.prepare("SELECT xp FROM users WHERE telegram_id='123'").get().xp;
assert.equal((await call('/api/shop/open',{})).status,200);
assert.equal((await call('/api/shop/open',{})).status,200);
assert.equal(db.prepare("SELECT xp FROM users WHERE telegram_id='123'").get().xp,xpBefore+100);
assert.equal(db.prepare("SELECT COUNT(*) n FROM web_achievement_events WHERE telegram_id='123' AND event='collector'").get().n,1);
assert.equal((await call('/api/shop/open',{},false)).status,401);
db.exec("INSERT INTO shop_order_customers(browser_key,created_at) VALUES('test','2026-11-13')");
const insertOrder=db.prepare("INSERT INTO shop_orders(customer_id,submission_key,order_details,created_at,previous_orders,telegram_id) VALUES(1,?,'{}','2026-11-13',0,?)");
const beforeOrder=db.prepare("SELECT xp FROM users WHERE telegram_id='123'").get().xp;
insertOrder.run('one','123');insertOrder.run('two','123');insertOrder.run('guest',null);
assert.equal(db.prepare("SELECT xp FROM users WHERE telegram_id='123'").get().xp,beforeOrder+100);
assert.equal(db.prepare("SELECT COUNT(*) n FROM web_achievement_events WHERE event='first-order'").get().n,1);
console.log('PASS: explorer auth, collector backfill, repeat events grant XP once, guest orders remain valid');

env.DB.batch=async statements=>{db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}};
const realFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,result:{message_id:1,chat:{id:1}}}),{headers:{'Content-Type':'application/json'}});
try {
 const request=new Request('https://shop.test/api/order',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({browserKey:'a'.repeat(32),submissionKey:'b'.repeat(32),fullName:'Test Rider',phone:'123',npBranch:'Branch',productTitle:'Test',qty:'1',price:'100'})});
 const result=await handleShopOrder(request,env,token);assert.equal(result.status,200);assert.equal((await result.json()).ok,true);
 assert.equal(db.prepare("SELECT telegram_id FROM shop_orders WHERE submission_key=?").get('b'.repeat(32)).telegram_id,'123');
 const profile=await readProgressProfile(env.DB,'123');assert(profile.rewards.includes('collector'));assert(profile.rewards.includes('first-order'));assert(profile.rewards.includes('explorer'));assert(!profile.rewards.includes('early-rider'));
} finally {globalThis.fetch=realFetch;}
console.log('PASS: real order handler binds verified Telegram identity and profile exposes web achievements');

const beforeVisit=db.prepare("SELECT xp FROM users WHERE telegram_id='123'").get().xp;
for(let i=0;i<2;i++) {
 const response=await handleProfile(new Request('https://shop.test/api/profile',{headers:{Cookie:cookie}}),env,token);
 assert.equal(response.status,200);assert((await response.json()).profile.rewards.includes('first-visit'));
}
assert.equal(db.prepare("SELECT xp FROM users WHERE telegram_id='123'").get().xp,beforeVisit+100);
console.log('PASS: authenticated first visit persists and credits exactly once');

for (const name of ['0009_role_collection.sql', '0010_prestige_roles.sql']) {
  db.exec(fs.readFileSync('migrations/' + name, 'utf8'));
}
assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_roles').get().n, 60);
assert(db.prepare("SELECT 1 FROM user_roles WHERE telegram_id='123' AND role_id='role-night'").get());

db.prepare("UPDATE users SET tokens = 50000 WHERE telegram_id = '123'").run();
const startingXP = db.prepare("SELECT xp FROM users WHERE telegram_id = '123'").get().xp;
for (const roleId of ['role-chromatic-flux', 'role-voidwalker', 'role-omega-relic']) {
  const response = await call('/api/shop/buy-role', { role_id: roleId });
  assert.equal(response.status, 200);
  wallet = await response.json();
}
assert.equal(wallet.balance, 50000 - 5100 - 5550 - 13500);
const prestigeAchievements = ['role-club-elite', 'role-collector-5', 'role-magnate'];
assert.deepEqual(wallet.roleAchievements, prestigeAchievements);
assert.equal(db.prepare("SELECT xp FROM users WHERE telegram_id = '123'").get().xp, startingXP + 300);
assert.equal((await call('/api/shop/buy-role', { role_id: 'role-omega-relic' })).status, 409);
for (const id of prestigeAchievements) {
  assert((await readProgressProfile(env.DB, '123')).rewards.includes(id));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM achievement_xp_grants WHERE telegram_id='123' AND achievement_id=?").get(id).n, 1);
}
console.log('PASS: 30 additional roles, preserved ownership, debit and three once-only prestige achievements');

db.exec(fs.readFileSync('migrations/0011_role_badges_and_equipment.sql', 'utf8'));
const catalogue = await (await call('/api/shop/roles')).json();
assert.equal(catalogue.roles.length, 60);
assert.equal(new Set(catalogue.roles.slice().filter(role => role.description === 'Prestige collection').map(role => role.icon)).size, 30);
assert.equal(catalogue.roles.find(role => role.id === 'role-omega-relic').price, 50000);
assert.equal((await call('/api/shop/active-role', { role_id: 'role-titan' })).status, 403);
assert.equal((await call('/api/shop/active-role', { role_id: 'role-omega-relic' }, false)).status, 401);
const savedBalance = wallet.balance;
const equipped = await (await call('/api/shop/active-role', { role_id: 'role-omega-relic' })).json();
assert.equal(equipped.profile.activeRole.id, 'role-omega-relic');
assert.equal(equipped.profile.activeRole.rarity, 'divine');
assert.equal((await readProgressProfile(env.DB, '123')).activeRole.id, 'role-omega-relic');
const removed = await (await call('/api/shop/active-role', { role_id: null })).json();
assert.equal(removed.profile.activeRole, null);
assert.equal(removed.profile.tokens, savedBalance);
assert(removed.profile.ownedRoles.some(role => role.id === 'role-omega-relic'));
assert.equal((await readProgressProfile(env.DB,'123')).activeRole,null);
console.log('PASS: server catalogue, owned-only equip, persistence and removal without a debit');

db.exec(fs.readFileSync('migrations/0012_jet_activity_farm.sql','utf8'));
db.exec(fs.readFileSync('migrations/0013_hourly_jet_and_taps.sql','utf8'));
db.exec(fs.readFileSync('migrations/0015_tap_abuse_limits.sql','utf8'));
const jet = (action, headers = {Cookie:cookie}) => handleJetActivity(
  new Request('https://shop.test/api/jet/' + action, {method:'POST', headers, body:'{}'}), env, token);
assert.equal((await jet('tap', {})).status,401);
assert.equal((await jet('activity-reward', {Cookie:cookie, Origin:'https://other.test'})).status,403);
const startBalance = (await (await jet('heartbeat')).json()).tokens;
const claims = await Promise.all([jet('activity-reward'),jet('activity-reward')]);
assert.deepEqual((await Promise.all(claims.map(r => r.json()))).map(r => r.credited || 0).sort(),[0,50]);
assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions WHERE type='activity_reward'").get().n,1);
assert.equal((await (await jet('heartbeat')).json()).tokens,startBalance+50);
db.exec("UPDATE users SET jet_tap_energy=0,jet_tap_refill_at=unixepoch(),jet_tap_last_ms=0 WHERE telegram_id='123'");
const taps = await Promise.all(Array.from({ length: 65 }, () => jet('tap')));
assert.equal(taps.filter(response => response.status === 200).length,1);
assert.equal(taps.filter(response => response.status === 429).length,64);
assert.equal(db.prepare("SELECT jet_tap_units FROM users WHERE telegram_id='123'").get().jet_tap_units,10);
db.exec("UPDATE users SET jet_tap_last_ms=0,jet_tap_day_count=1200 WHERE telegram_id='123'");
assert.equal((await jet('tap')).status,429);
db.exec("UPDATE users SET jet_tap_day=jet_tap_day-1,jet_tap_units=640 WHERE telegram_id='123'");
assert.equal((await jet('tap')).status,200);
const tapState = await (await jet('heartbeat')).json();
assert.equal(tapState.jetiki,650);
assert.equal('energy' in tapState,false);
const swaps = await Promise.all([jet('exchange'),jet('exchange')]);
assert.deepEqual((await Promise.all(swaps.map(r => r.json()))).map(r => r.exchanged || 0).sort(),[0,1]);
const final = await (await jet('heartbeat')).json();
assert.equal(final.jetiki,50);
assert.equal(final.tokens,startBalance+56);
assert.equal(db.prepare("SELECT COUNT(*) n FROM jet_transactions WHERE reason IN ('Hourly JET reward','Jetiki exchange')").get().n,2);
console.log('PASS: hourly cooldown, 65-request burst, daily quota, UTC rollover and atomic exchange');
