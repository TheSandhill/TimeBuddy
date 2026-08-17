import { useEffect, useRef, useState } from "react";
import { menuItemClass, menuTriggerClass } from "./button";
import { Icon } from "./icon";

interface MenuItem {
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function RowMenu({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className={menuTriggerClass}
      >
        <Icon name="more" className="size-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 flex min-w-32 flex-col rounded-lg border border-hairline bg-surface-raised py-1"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              aria-label={item.ariaLabel}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={menuItemClass}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
