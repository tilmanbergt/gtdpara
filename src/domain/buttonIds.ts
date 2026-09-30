/**
 * Ids of the buttons registered in index.js at startup. Shared so App.tsx's
 * reorientation logic can tell "our sidebar button was pressed" apart from
 * the Lasso edit button registered alongside it, without index.js
 * and App.tsx each hardcoding the same magic number and risking drift.
 */
export const SIDEBAR_BUTTON_ID = 100;
export const LASSO_BUTTON_ID = 200;
