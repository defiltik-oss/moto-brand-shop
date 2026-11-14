import { subscriberCount } from '../public/subscriber-cache.mjs';

export default {
  async scheduled(_controller, env) {
    if (!env.YOUTUBE_API_KEY) throw new Error('Set YOUTUBE_API_KEY on this Worker');
    await subscriberCount(env.DB, env);
  },
};
