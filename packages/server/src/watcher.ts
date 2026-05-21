import type { TopicCache } from '@buddy/query';

export function createTreeWatcher(topicCache: TopicCache) {
  return {
    close: () => topicCache.close(),
  };
}
