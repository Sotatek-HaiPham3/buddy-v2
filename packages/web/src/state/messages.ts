import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.messages(conversationId!),
    enabled: !!conversationId,
  });
}
