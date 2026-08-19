import type { SelectHTMLAttributes } from "react";
import { selectButtonClass, selectCaretClass } from "./field";
import { Icon } from "./icon";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Whether this browser draws the list itself.
 *
 * Asked in JavaScript rather than left to `@supports` — which is what the rest
 * of the treatment uses — because the enhancement is markup as well as style: a
 * customizable select holds a `<button>` and a `<selectedcontent>` that only a
 * parser which knows about them keeps inside the select. An older one hoists the
 * button out and leaves a stray control beside the field, which is a good deal
 * worse than the native popup being kept.
 */
function supportsBaseSelect(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("appearance", "base-select")
  );
}

/**
 * The one `<select>` in the app, so its open list is themed once — the whole of
 * the reasoning is in `CONTEXT.md` → Dropdown.
 *
 * It stays a real `<select>`, so the arrows, Home/End, typeahead, Enter and
 * Escape and the accessibility tree all still come free from the platform, and
 * every caller keeps the `onChange` contract it already had. What changes is who
 * draws the popup, and that is asked for in `styles.css` — where the pseudo-
 * elements a class cannot reach live — and here, in the markup half of it.
 */
export function Select({ children, ...rest }: SelectProps) {
  return (
    <select {...rest}>
      {supportsBaseSelect() ? (
        <button type="button" className={selectButtonClass}>
          {/* The browser fills this with the selected option's own content, so
              nothing here has to duplicate what the list already says. */}
          <selectedcontent />
          <Icon name="chevron" className={selectCaretClass} />
        </button>
      ) : null}
      {children}
    </select>
  );
}
