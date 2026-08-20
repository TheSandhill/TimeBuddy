import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuItemClass, menuTriggerClass } from "./button";
import { Icon } from "./icon";

import type { IconName } from "./icon";

interface MenuItem {
  label: string;
  ariaLabel?: string;
  icon?: IconName;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The items focus can actually land on, in the order they are drawn.
 *
 * Read from the DOM rather than counted off the `items` prop because a disabled
 * `<button>` cannot be focused at all — so the ones to step over are exactly the
 * ones the document already refuses, and there is no second list to keep true.
 */
function focusableItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"),
  );
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

  /**
   * Closing the menu is two things, and only one of them is always wanted: the
   * row is where the user was, so Escape and choosing an item come back to the
   * trigger — but a click elsewhere is the user already somewhere else, and
   * dragging them back would undo the move they just made.
   */
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

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
        close(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  /**
   * The menu is portalled to the end of `document.body`, so what follows the
   * trigger in tab order is the rest of the screen and not the items. Focus is
   * therefore moved deliberately on open: without it the only way in is to tab
   * past everything else on the page.
   */
  useEffect(() => {
    if (!open) return;
    focusableItems(menuRef.current)[0]?.focus();
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const focusable = focusableItems(menuRef.current);
    if (focusable.length === 0) return;

    const at = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const moveTo = (index: number) => {
      e.preventDefault();
      focusable[index]?.focus();
    };

    // Arrows wrap: a menu of three is short enough that running off the end is
    // a slip rather than an instruction to stop.
    if (e.key === "ArrowDown") moveTo(at < 0 ? 0 : (at + 1) % focusable.length);
    else if (e.key === "ArrowUp")
      moveTo(at < 0 ? focusable.length - 1 : (at - 1 + focusable.length) % focusable.length);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(focusable.length - 1);
  };

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
              onKeyDown={onMenuKeyDown}
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
                    close(true);
                    item.onClick();
                  }}
                  className={`${menuItemClass} flex items-center gap-2`}
                >
                  {item.icon ? <Icon name={item.icon} className="size-4" /> : null}
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
