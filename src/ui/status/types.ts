/**
 * Central status slot - message model (docs/dev/history/technical-design-status-slot.md §3).
 *
 * One fixed-height strip under the TabBar (and at the top of focus mode)
 * shows every user-facing message: pick ("armed") states, confirms,
 * errors, warnings, successes. Only load errors still render in place.
 */

export type StatusKind = 'confirm' | 'modal' | 'error' | 'warning' | 'success' | 'info';

export interface StatusAction {
  label: string;
  onPress: () => void;
  primary?: boolean;
}

export interface StatusMessage {
  kind: StatusKind;
  /** One line in the slot; tail-truncated when too long. */
  text: string;
  /** Full text for the tap-to-expand overlay (§5, D12). Defaults to `text`. */
  detail?: string;
  /** Right-aligned buttons. 'confirm' has exactly one; 'modal' none (Cancel comes from onCancel). */
  actions?: StatusAction[];
  /** Shows a ✕; called on tap. The owner clears its own state here. */
  onDismiss?: () => void;
  /** 'modal' ("Cancel") and 'confirm' (✕): what cancelling does. */
  onCancel?: () => void;
  /** 'screen' (default): cleared when the publishing component unmounts. 'global': survives it (D13). */
  scope?: 'screen' | 'global';
}

/** Lower = more important. confirm > modal > error > warning > success > info (§3). */
export const STATUS_PRIORITY: Record<StatusKind, number> = {
  confirm: 0,
  modal: 1,
  error: 2,
  warning: 3,
  success: 4,
  info: 5,
};

/** Fixed slot height (px). Always reserved, so a message never shifts the layout (D1). */
export const STATUS_SLOT_HEIGHT = 36;

/** How long the tap-to-expand overlay stays open (§8 Q11). */
export const STATUS_EXPAND_MS = 3000;
