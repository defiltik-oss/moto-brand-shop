import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('public/_worker.js', 'utf8').replace('./subscriber-cache.mjs', pathToFileURL('public/subscriber-cache.mjs').href) + '\nexport {handleProfile,handleCatalog,createProfileSession,MEMORY_USERS};';
const {default: worker,handleProfile,handleCatalog,createProfileSession,MEMORY_USERS} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const token = 'isolated-test-secret';
const env = { BOT_TOKEN: token };
const owner = '5905168657';
MEMORY_USERS.set(owner, { id: owner });
const cookie = (await createProfileSession(owner, token)).split(';')[0];
const request = (path, headers = {}, body) => new Request('https://shop.test' + path, {
  headers: { 'Content-Type': 'application/json', ...headers },
  ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
});
for (const headers of [{}, {'X-Telegram-Id':owner}, {'X-Telegram-Init-Data':'user=%7B%22id%22%3A5905168657%7D'}]) {
  const response = await handleProfile(request('/api/profile', headers), env, token);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.authenticated, false);
  assert.equal(data.isAdmin, false);
  assert.equal((await handleCatalog(request('/api/catalog/admin', headers), env, '/api/catalog/admin')).status, 403);
}
for (const body of [undefined, {initData:'incomplete'}]) {
  const response = await handleProfile(request('/api/profile', {Cookie:cookie}, body), env, token);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.isAdmin, true);
  assert.equal(data.telegram_id, owner);
}
// Passing authentication reaches the missing-database response, rather than 403.
assert.equal((await handleCatalog(request('/api/catalog/admin', {Cookie:cookie}), env, '/api/catalog/admin')).status, 503);
const other = (await createProfileSession('123',token)).split(';')[0];
assert.equal((await handleCatalog(request('/api/catalog/admin', {Cookie:other,'X-Telegram-Id':owner}), env, '/api/catalog/admin')).status,403);
assert.equal((await handleCatalog(request('/api/catalog/admin', {Cookie:cookie+'x'}), env, '/api/catalog/admin')).status,403);
const catalogEnv = { ...env, DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } };
for (const path of ['/api/admin/products', '/api/catalog/admin']) {
  const response = await worker.fetch(request(path, {Cookie:cookie}), catalogEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { isAdmin: true, telegram_id: owner, products: [] });
  assert.equal((await worker.fetch(request(path, {'X-Telegram-Id':owner}), catalogEnv)).status, 403);
  for (const method of ['PUT', 'PATCH']) {
    const foreignRequest = new Request('https://shop.test' + path, {
      method, headers: { Cookie:cookie, Origin:'https://other.test' },
    });
    assert.equal((await worker.fetch(foreignRequest, catalogEnv)).status, 403);
  }
}
console.log('Catalog authentication regression checks passed');

for (const headers of [{'X-Admin-Id':owner}, {'X-Admin-Key':owner}, {Cookie:other}, {}]) {
  const response = await worker.fetch(request('/api/admin/users?adminId=' + owner, headers), env);
  assert.equal(response.status, 403);
}
const webhookEnv = { ...env, TELEGRAM_WEBHOOK_SECRET:'test-webhook-secret' };
for (const path of ['/webhook', '/api/telegram']) {
  const spoofed = {message:{from:{id:Number(owner)},chat:{id:1},text:'/addjet 123 1000000'}};
  assert.equal((await worker.fetch(request(path, {}, spoofed), webhookEnv)).status,403);
  assert.equal((await worker.fetch(request(path, {}, spoofed), env)).status,503);
  assert.equal((await worker.fetch(request(path, {'X-Telegram-Bot-Api-Secret-Token':'test-webhook-secret'}, {}), webhookEnv)).status,200);
}
console.log('PASS: spoofed admin ID and unsigned Telegram update rejected');
