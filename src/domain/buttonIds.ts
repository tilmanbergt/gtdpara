/**
 * Ids of the buttons registered in index.js at startup. Shared so App.tsx's
 * reorientation logic can tell "our sidebar button was pressed" apart from
 * the Lasso edit button registered alongside it, without index.js
 * and App.tsx each hardcoding the same magic number and risking drift.
 */
export const SIDEBAR_BUTTON_ID = 100;
export const LASSO_BUTTON_ID = 200;
/** "Mark for later" in the lasso toolbar (docs/dev/technical-design-lasso-0.8.md §3.6) - runs without opening gtdpara (showType 0); handled in index.js. */
export const MARK_BUTTON_ID = 300;
