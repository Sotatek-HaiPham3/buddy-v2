import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function useConversations(topic: string) {
  return useQuery({
    queryKey: ['conversations', topic],
    queryFn: () => api.conversations(topic),
    enabled: !!topic,
  });
}

export function useCreateConversation(topic: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => api.createConversation(topic, title),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversations', topic] }),
  });
}

export function useRenameConversation(topic: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.renameConversation(id, title),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversations', topic] }),
  });
}

export function useDeleteConversation(topic: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversations', topic] }),
  });
}
