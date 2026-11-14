# Role economy and WebView changes

Files: migrations/0005_role_economy.sql, public/_worker.js, src/components/RoleShop.astro, src/scripts/roleShop.ts.

Apply migration 0005 once, after the existing schema/migrations. Do not recreate users or reset balances. users.balance is a generated INTEGER alias for tokens: existing admin commands, referrals, rewards, frames and achievements retain one wallet and the existing initial 100 JET. The ledger imports old transactions, reconciles opening balances and records future token deltas. Generic existing adjustments use balance_change; role purchases use purchase_role.

The public catalog has 10 roles, prices 50–5000 JET. Existing role ownership is imported without a second debit. API profile/history is private (latest 50 entries). Client-supplied telegram_id is only a consistency check; identity comes from signed fresh initData or the signed session cookie. Role insertion and SQLite triggers debit/check/log atomically. Negative balance, duplicate role and journal failures cannot partially commit a purchase.

Deployment order after checking the current database migration state:

    npx wrangler d1 migrations apply alexov-shop-db --remote
    npx wrangler pages deploy public

No remote migration or deployment was performed. Until migration 0005 is applied, the new economy endpoints return storage/economy unavailable; the existing order routes remain intact.

Audit: the shipped page loads main.ts and its imports; dormant GSAP/Three.js modules are not mounted by the current index. main.ts had two permanent intervals; now one foreground-only timer handles activity with bounded requests and no overlaps. Glass had unowned observers and frame scheduling; observers/listeners now have cleanup, scheduling stops while hidden, and touch devices use the existing glass-lite renderer. The default performance mode is restored. CSS animations pause while hidden. Terms observers and listeners clean up before Astro swaps, and Telegram swipe SDK failures cannot block acceptance. The dormant smooth-scroll ticker now suspends/resumes and disposes too. Existing bikes.ts already pauses tickers on visibilitychange and returns disposal functions. Remaining rAF uses in main.ts/bikeViewer.ts are one-shot, not perpetual loops. Static-page DOM listeners persist for the document lifetime; the project currently has no Astro ClientRouter.

Checks:

    node tests/role-economy.mjs
    node tests/activity-lifecycle.mjs
    node --check public/_worker.js
    npm run build

The tests use local SQLite/D1 mocks, not a production account or Telegram messages. Device GPU profiling and a live Telegram WebView suspend/resume test still require an actual device; no 60 FPS guarantee or definitive diagnosis of the reported freeze is claimed.

## Web achievements / modal redesign

Apply migrations 0005 and 0006 before deploying this version (0005 only if not already applied). Migration 0006 adds web_achievement_events and the optional verified Telegram identity on shop_orders. Anonymous orders still work; their history is not guessed or assigned to a Telegram user from an untrusted username. Historical orders cannot be safely backfilled because they did not store verified Telegram IDs. Historical purchased roles are backfilled as collector. Existing XP is retained and each event grants at most 100 XP via the unique achievement_xp_grants key.

first-visit is recorded after website authentication, explorer through authenticated POST /api/shop/open, first-order by a trigger on persisted authenticated orders, collector by a trigger on actual role purchases. Offline achievements are removed from the UI catalog; web tenure, balance and OG achievements remain. New web badges cannot be granted by changing rewards JSON. Administrators retain their existing role/XP controls.

The role shop is now a native modal dialog with a fixed header, a 44px close button, Escape handling isolated from the parent profile, native focus containment, focus restoration and a scrollable body. Transactions use separate cards and localized dates; positive/negative values have both distinct signs and colors. Profile achievements refresh after orders, role purchases and shop opens.
