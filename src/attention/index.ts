/**
 * Public surface of the attention module.
 *
 * The haunt engine must treat every `present` signal as a reset to haunt
 * level 0.
 *
 * The module's only output is an AttentionSignal (`present` or `away` plus a
 * timestamp). Pose, landmark, and frame types stay internal and are
 * deliberately not exported here.
 */

export { createAttention } from './controller';
export type { Attention, AttentionControls } from './controller';
export type { AttentionSignal, AttentionStatus } from './types';
