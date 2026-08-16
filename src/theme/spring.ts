/**
 * The spring that drives the tab bar's active pill.
 *
 * A spring is not a cubic-bézier and cannot be a CSS variable, so it lives here
 * rather than in the theme tokens. Two motion systems, named as two: CSS for
 * state transitions, springs for layout. A token only one library can read
 * would be a token in name.
 */
export const tabIndicatorSpring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 35,
  mass: 1,
};
