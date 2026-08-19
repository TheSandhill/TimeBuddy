/**
 * `<selectedcontent>` — the element a customizable `<select>` mirrors the chosen
 * option's content into (#72). Part of HTML, and not yet part of React's element
 * table, so the one place that renders it gets a type rather than a cast.
 */
import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      selectedcontent: React.HTMLAttributes<HTMLElement>;
    }
  }
}
