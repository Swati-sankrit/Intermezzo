/** The gate's bookkeeping for one open port. */
import type { Unsubscribe } from '../types';
import type { AudioChannel } from './audioTypes';
import type { PortVisual } from './gatePort';

export interface PortRecord {
  readonly id: string;
  readonly channel: AudioChannel;
  readonly pv: PortVisual;
  readonly closeVisual: () => void;
  requested: number;
  /** Last target sent to the channel; new channels start silent. */
  sent: number;
  faded: boolean;
  /** Fade-out length this port was asked to use; falls of this port use it. */
  fadeMs?: number;
  closed: boolean;
  /** Cancel functions of this port's `onAudibleChange` subscriptions. */
  readonly audibleOffs: Set<Unsubscribe>;
}
