import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function useTopics() {
  return useQuery({ queryKey: ['topics'], queryFn: api.topics });
}

export function useDocs(topic: string) {
  return useQuery({
    queryKey: ['docs', topic],
    queryFn: () => api.docs(topic),
    enabled: !!topic,
  });
}
