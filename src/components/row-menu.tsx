import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const dismiss = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      )
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

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
        className={menuTriggerClass}
      >
        <Icon name="more" className="size-5" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, right: pos.right }}
              className="fixed z-50 flex min-w-32 flex-col rounded-lg border border-hairline bg-surface-raised py-1"
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
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
