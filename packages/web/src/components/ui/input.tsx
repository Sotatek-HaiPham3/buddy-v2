import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('w-full rounded-md border border-slate-300 px-2 py-1 text-sm', props.className)} />;
}
