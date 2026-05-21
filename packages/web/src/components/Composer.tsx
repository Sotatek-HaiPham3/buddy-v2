import { useState } from 'react';
import { Button } from './ui/button.js';

export function Composer({ onSubmit, pending }: { onSubmit: (q: string) => void; pending: boolean }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="flex gap-2 border-t bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim() || pending) return;
        onSubmit(value.trim());
        setValue('');
      }}
    >
      <input
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question"
      />
      <Button type="submit" disabled={pending}>
        Send
      </Button>
    </form>
  );
}
