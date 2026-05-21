import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CitationChip } from '../../components/CitationChip.js';

describe('CitationChip', () => {
  it('renders logical and physical pages when both exist and differ', () => {
    const onClick = vi.fn();
    render(<CitationChip doc="a.pdf" pages={[40]} logicalPages={[9]} onClick={onClick} />);
    expect(screen.getByRole('button')).toHaveTextContent('a.pdf p.9 (PDF p.40)');
  });

  it('renders physical page only when logical is missing', () => {
    const onClick = vi.fn();
    render(<CitationChip doc="a.pdf" pages={[40]} onClick={onClick} />);
    expect(screen.getByRole('button')).toHaveTextContent('a.pdf p.40');
  });

  it('renders physical-only style when logical and physical are equal', () => {
    const onClick = vi.fn();
    render(<CitationChip doc="a.pdf" pages={[40]} logicalPages={[40]} onClick={onClick} />);
    expect(screen.getByRole('button')).toHaveTextContent('a.pdf p.40');
    expect(screen.getByRole('button')).not.toHaveTextContent('PDF');
  });

  it('keeps click behavior using physical page start', async () => {
    const onClick = vi.fn();
    render(<CitationChip doc="a.pdf" pages={[40, 42]} logicalPages={[9, 11]} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('a.pdf', 40);
  });
});
