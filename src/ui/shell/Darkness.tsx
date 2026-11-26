import type { CSSProperties } from 'react';
import { shellEffects, type ShellEffects } from '../shellEffects';
import './ShellEffects.css';

export interface DarknessProps {
  effects?: ShellEffects;
}

/**
 * Dark veil behind all Shell content, dimmed to `backgroundBrightness`, with a Vignette
 * (clear centre, darker edges, `vignette` strength). Decorative: no pointer events, no focus.
 * Mounted only by the Shell, never on the reading page.
 */
export function Darkness({ effects = shellEffects }: DarknessProps) {
  const { backgroundBrightness, vignette } = effects.strengths;
  const style = {
    '--bg-brightness': backgroundBrightness,
    '--vignette': vignette,
  } as CSSProperties;
  return (
    <div className="shell-darkness" style={style} aria-hidden="true">
      <div className="shell-darkness__vignette" />
    </div>
  );
}
