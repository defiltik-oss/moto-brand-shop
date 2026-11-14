export async function subscriberCount(db, env) {
  const channel = env.YOUTUBE_CHANNEL_HANDLE || '@Alexov_STREET_TEAM_official';
  const now = Math.floor(Date.now() / 1000);
  const read = () => db.prepare('SELECT count,fetched_at,retry_at FROM subscriber_cache WHERE channel=?').bind(channel).first();
  const key = "youtube:" + channel;
  const edgeCache = env.SUBSCRIBER_CACHE;
  const fromKV = edgeCache ? await edgeCache.get(key, "json").catch(() => null) : null;
  if (Number.isSafeInteger(fromKV?.count) && fromKV.count >= 0 &&
      Number.isSafeInteger(fromKV.updatedAt) && now - fromKV.updatedAt < 3600) return fromKV;
  let cached = await read();
  if (env.YOUTUBE_API_KEY && (!cached || cached.retry_at <= now)) {
    const lease = await db.prepare('INSERT INTO subscriber_cache(channel,retry_at) VALUES(?,?) ON CONFLICT(channel) DO UPDATE SET retry_at=excluded.retry_at WHERE subscriber_cache.retry_at<=? RETURNING channel')
      .bind(channel, now + 300, now).first();
    if (lease) {
      try {
        const url = new URL('https://www.googleapis.com/youtube/v3/channels');
        url.search = new URLSearchParams({ part: 'statistics', forHandle: channel, key: env.YOUTUBE_API_KEY });
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const statistics = response.ok ? (await response.json()).items?.[0]?.statistics : null;
        const count = Number(statistics?.subscriberCount);
        if (!statistics?.hiddenSubscriberCount && Number.isSafeInteger(count) && count >= 0) {
          await db.prepare('UPDATE subscriber_cache SET count=?,fetched_at=?,retry_at=? WHERE channel=?')
            .bind(count, now, now + 3600, channel).run();
        }
      } catch {
        // Preserve the last successful count on upstream failure.
      }
    }
    cached = await read();
  }
  const result = { count: cached?.count ?? fromKV?.count ?? null, updatedAt: cached?.fetched_at ?? fromKV?.updatedAt ?? null };
  if (edgeCache && result.count !== null && result.updatedAt !== fromKV?.updatedAt) {
    await edgeCache.put(key, JSON.stringify(result)).catch(() => {});
  }
  return result;
}

