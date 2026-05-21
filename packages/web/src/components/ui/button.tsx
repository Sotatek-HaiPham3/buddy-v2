import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Button({
  className,
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'ghost' }) {
  return (
    <button
      className={cn(
        'rounded-md px-3 py-1.5 text-sm',
        variant === 'ghost' ? 'hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-700',
        className,
      )}
      {...props}
    />
  );
}
