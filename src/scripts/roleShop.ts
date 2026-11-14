import { ACHIEVEMENTS_CATALOG } from '../data/gamification';
import { createRoleBadge, type ShopRole } from './roleBadge';
type Wallet = {balance:number; roles:ShopRole[]; active_role_id?:string|null; roleAchievements?:string[]; transactions:{id:number; amount:number; description:string; created_at:string}[]};
export function initRoleShop(getInitData:()=>string, getLocale:()=>string, refreshProfile:()=>Promise<void>) {
 const panel=document.querySelector<HTMLDialogElement>('#role-shop');
 if(!panel) return;
 const lifecycle=new AbortController();
 const closer=document.querySelector<HTMLButtonElement>('#role-shop-close')!;
 let oldOverflow='';
 let pending:AbortController|null=null, wallet:Wallet|null=null, catalog:ShopRole[]=[], busy=false;
 const text=(uk:string,en:string)=>getLocale()==='en'?en:uk;
 const status=document.querySelector<HTMLElement>('#role-status')!;
 const errors:Record<string,()=>string>={
 'telegram-auth':()=>text('Увійдіть через Telegram.','Sign in with Telegram.'),
 'insufficient-funds':()=>text('Недостатньо JET.','Not enough JET.'),
 'already-owned':()=>text('Цю роль уже придбано.','You already own this role.')};
 async function api(path:string,signal:AbortSignal,role?:string|null) {
  const response=await fetch(path,{method:role!==undefined?'POST':'GET',credentials:'same-origin',signal,
   headers:{'Content-Type':'application/json','X-Telegram-Init-Data':getInitData()},
   ...(role!==undefined?{body:JSON.stringify({role_id:role})}:{})});
  const data=await response.json();
  if(!response.ok || !data.ok) throw new Error(data.error || 'unavailable');
  return data;
 }
 function render() {
  const labels={title:text('Магазин ролей','Role shop'),balance:text('Баланс','Balance'),refresh:text('Оновити','Refresh'),history:text('Історія транзакцій (останні 50)','Transactions (latest 50)')};
  closer.setAttribute('aria-label',text('Закрити','Close'));
  panel!.querySelectorAll<HTMLElement>('[data-role-label]').forEach(el=>el.textContent=labels[el.dataset.roleLabel as keyof typeof labels]);
  document.querySelector('#role-balance')!.textContent=wallet?String(wallet.balance):'—';
  const list=document.querySelector('#role-catalog')!; list.replaceChildren();
  for(const role of catalog) {
   const row=document.createElement('article'); row.className='role-product';
   const name=document.createElement('div');
   name.append(createRoleBadge(role));
   const rarityLabels: Record<string, string> = {
    rare:text('Рідкісна','Rare'), epic:text('Епічна','Epic'), legendary:text('Легендарна','Legendary'),
    mythic:text('Міфічна','Mythic'), divine:text('Божественна','Divine'),
   };
   const desc=document.createElement('small');
   desc.textContent = `${rarityLabels[role.rarity || 'rare'] ?? rarityLabels.rare} · ${role.price.toLocaleString(getLocale())} JET`;
   name.append(desc);
   const buy=document.createElement('button'); buy.type='button'; buy.dataset.roleId=role.id;
   const owned=wallet?.roles.some(r=>r.id===role.id);
   const active = wallet?.active_role_id === role.id;
   buy.dataset.action = active ? 'remove' : owned ? 'equip' : 'buy';
   buy.disabled=busy || !wallet || (!owned && wallet.balance<role.price);
   buy.textContent=active ? text('Активна · Зняти','Active · Remove') : owned ? text('Надіти','Equip')
    : text('Купити · ', 'Buy · ') + role.price.toLocaleString(getLocale()) + ' JET';
   row.append(name,buy);list.append(row);
  }
  const history=document.querySelector('#role-history')!;history.replaceChildren();
  for(const tx of wallet?.transactions || []) {
   const li=document.createElement('li');li.className='role-transaction';li.dataset.credit=String(tx.amount>0);
   const details=document.createElement('div');details.textContent=tx.description;
   const time=document.createElement('time');
   const iso=tx.created_at.includes('T')?tx.created_at:tx.created_at.replace(' ','T')+'Z';
   const date=new Date(iso);
   time.textContent=Number.isNaN(date.getTime())?text('Дата недоступна','Date unavailable'):new Intl.DateTimeFormat(getLocale()==='en'?'en-GB':'uk-UA',{dateStyle:'medium',timeStyle:'short'}).format(date);
   if(!Number.isNaN(date.getTime()))time.dateTime=date.toISOString();
   const amount=document.createElement('strong');amount.textContent=(tx.amount>0?'+':'−')+Math.abs(tx.amount)+' JET';
   details.append(time);li.append(details,amount);history.append(li);
  }
  if(wallet && !wallet.transactions.length){const empty=document.createElement('li');empty.textContent=text('Транзакцій ще немає.','No transactions yet.');history.append(empty);}
 }
 async function load(role?:string, action = 'buy') {
  if(busy) return;
  busy=true;pending=new AbortController(); const signal=pending.signal; const timeout=setTimeout(()=>pending?.abort(),15000);
  status.textContent=text('Завантаження…','Loading…');render();
  try {
   if (role && action !== 'buy') {
    const { profile } = await api('/api/shop/active-role', signal, action === 'remove' ? null : role);
    if (wallet) wallet.active_role_id = profile.activeRole?.id ?? null;
    status.textContent = text('Активну роль оновлено.', 'Active role updated.');
    void refreshProfile().catch(()=>{});
   } else if (role) {
    const previous = new Set(wallet?.roleAchievements ?? []);
    wallet = await api('/api/shop/buy-role', signal, role);
    const unlocked = ACHIEVEMENTS_CATALOG
      .filter(item => wallet?.roleAchievements?.includes(item.id) && !previous.has(item.id))
      .map(item => text(item.titleUk, item.titleEn));
    status.textContent = text('Роль придбано.', 'Role purchased.') +
      (unlocked.length ? ' ' + text('Відкрито: ', 'Unlocked: ') + unlocked.join(', ') : '');
    void refreshProfile().catch(()=>{});
   } else {
    const [items, profile] = await Promise.all([api('/api/shop/roles', signal), api('/api/user/profile', signal)]);
    catalog = items.roles;
    wallet = profile;
    status.textContent = '';
   }
  } catch(error) {
   const code=error instanceof Error?error.message:'';
   status.textContent=errors[code]?.() || text('Не вдалося оновити. Натисніть «Оновити», щоб перевірити стан покупки.','Could not update. Refresh to check the purchase status.');
  } finally {clearTimeout(timeout);busy=false;pending=null;render();}
 }
 panel.addEventListener('alexov:open-role-shop',()=>{
  if(panel.open)return;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.showModal();closer.focus();void load();
  fetch('/api/shop/open',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':getInitData()},body:'{}',signal:lifecycle.signal})
   .then(r=>{if(r.ok)return refreshProfile();}).catch(()=>{});
 },{signal:lifecycle.signal});
 panel.addEventListener('keydown',event=>event.stopPropagation(),{signal:lifecycle.signal});
 closer.addEventListener('click',()=>panel.close(),{signal:lifecycle.signal});
 panel.addEventListener('close',()=>{pending?.abort();document.body.style.overflow=oldOverflow;document.getElementById('open-navigation-btn')?.focus();},{signal:lifecycle.signal});
 panel.addEventListener('click',event=>{if(event.target===panel){const r=panel.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)panel.close();}},{signal:lifecycle.signal});
 panel.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button[data-role-id]');if(button?.dataset.roleId) void load(button.dataset.roleId, button.dataset.action);},{signal:lifecycle.signal});
 document.querySelector('#role-refresh')?.addEventListener('click',()=>void load(),{signal:lifecycle.signal});
 const observer=new MutationObserver(render);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pending?.abort();else if(panel.open)void load();},{signal:lifecycle.signal});
 document.addEventListener('astro:before-swap',()=>{if(panel.open){panel.close();document.body.style.overflow=oldOverflow;}lifecycle.abort();pending?.abort();observer.disconnect();},{once:true});
 render();
}
