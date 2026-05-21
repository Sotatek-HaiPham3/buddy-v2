import type { HistoryTurn } from './types.js';

export function summarizeHistory(history: HistoryTurn[]): string {
  if (history.length === 0) return '';
  return history
    .slice(-6)
    .map((turn) => `${turn.role === 'user' ? 'asked' : 'answered'}: ${turn.content.slice(0, 160)}`)
    .join(' | ');
}
