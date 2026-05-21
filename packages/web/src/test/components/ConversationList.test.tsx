import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationList } from '../../components/ConversationList.js';

describe('ConversationList', () => {
  it('selects conversation', async () => {
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={[{ id: 'a', title: 'Today chat', updated_at: Date.now() }]}
        activeId={null}
        onSelect={onSelect}
        onRename={() => {}}
        onDelete={() => {}}
        onExport={() => {}}
      />,
    );
    await userEvent.click(screen.getByText('Today chat'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
