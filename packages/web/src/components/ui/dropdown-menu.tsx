import { useState, type ReactNode } from 'react';

interface Item {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function DropdownMenu({ trigger, items }: { trigger: ReactNode; items: Item[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded p-1 hover:bg-slate-100">
        {trigger}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-28 rounded-md border bg-white p-1 shadow">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 ${
                item.danger ? 'text-red-600' : ''
              }`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
