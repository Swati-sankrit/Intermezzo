import { useState, type CSSProperties, type ReactNode } from 'react';
import { CandlePool, candleVariable } from './CandlePool';
import { Darkness } from './Darkness';
import { EffectBoundary } from './EffectBoundary';
import { drawnLooks, shellEffects, type ShellEffects } from '../shellEffects';
import { FlameCursor } from './FlameCursor';
import { FogLayer } from './FogLayer';
import { LurkingGhost } from './LurkingGhost';
import { SmokeLayer } from './SmokeLayer';
import { LedgerTab } from './LedgerTab';
import type { DataModel } from '../../library/model';
import { localDateString } from '../../library/statsSelectors';
import { panelId, tabId, TabBar } from './TabBar';
import { loadShellTab, saveShellTab, SHELL_TAB_NAMES, type ShellTabName } from './tabStorage';
import { clearShellData } from './clearShellData';
import { SeanceTab, type SeanceTabProps } from './SeanceTab';
import './ShellFrame.css';

export interface ShellFrameProps {
  /** The Library tab's content (the existing LibraryScreen). */
  library: ReactNode;
  /** Tab to show first. Defaults to the saved tab. */
  initialTab?: ShellTabName;
  /** Called whenever the active tab changes, so the owner can restore it later. */
  onTabChange?: (tab: ShellTabName) => void;
  /** The Profile's Candle_Colour; a missing or unknown name gives amber. */
  candleColour?: string;
  /** Effect options; defaults to the file `shellEffects.ts`. */
  effects?: ShellEffects;
  /** The loaded Data_Model for the Ledger. Leave it out while the library loads. */
  model?: DataModel;
  /** Today's Local_Date for the Ledger. Defaults to the device's date. */
  today?: string;
  /** What the Séance needs. Leave it out and the Séance panel stays empty. */
  seance?: SeanceTabProps;
}

/** Owns the active tab and shows the Tab_Bar with one Tab_Panel per tab. */
export function ShellFrame({ library, initialTab, onTabChange, candleColour, effects = shellEffects, model, today, seance }: ShellFrameProps) {
  const looks = drawnLooks(effects);
  const s = effects.strengths;
  // Read by LitCover.css so the cover dimming comes from shellEffects.ts alone.
  const frameStyle = {
    '--cover-glow': candleVariable(candleColour),
    '--image-brightness': s.imageBrightness,
    '--image-saturation': s.imageSaturation,
    '--light-radius': `${s.lightRadiusPx}px`,
  } as CSSProperties;
  const [active, setActive] = useState<ShellTabName>(() => initialTab ?? loadShellTab());

  // Bumped after a successful "Clear my data" so the Séance remounts showing the defaults.
  const [seanceKey, setSeanceKey] = useState(0);
  const clearData = async () => {
    const ok = (await seance?.onClearData()) ?? false;
    if (ok) {
      clearShellData();
      setSeanceKey((k) => k + 1);
    }
    return ok;
  };

  const change = (tab: ShellTabName) => {
    setActive(tab);
    saveShellTab(tab);
    onTabChange?.(tab);
  };

  return (
    <div className="shell-frame" style={frameStyle}>
      <EffectBoundary><Darkness effects={effects} /></EffectBoundary>
      {looks.ambient === 'smoke' && <EffectBoundary><SmokeLayer effects={effects} /></EffectBoundary>}
      {looks.ambient === 'fog' && <EffectBoundary><FogLayer /></EffectBoundary>}
      {looks.cursorLight === 'flame' && <EffectBoundary><FlameCursor effects={effects} /></EffectBoundary>}
      {looks.cursorLight === 'pool' && (
        <EffectBoundary><CandlePool candleColour={candleColour} effects={effects} /></EffectBoundary>
      )}
      {active === 'library' && <EffectBoundary><LurkingGhost effects={effects} /></EffectBoundary>}
      <div className="shell-frame__content">
      <TabBar active={active} onChange={change} />
      {SHELL_TAB_NAMES.map((tab) => (
        <div
          key={tab}
          role="tabpanel"
          id={panelId(tab)}
          aria-labelledby={tabId(tab)}
          hidden={tab !== active}
          className="shell-frame__panel"
        >
          {tab === 'library' && library}
          {tab === 'ledger' && <LedgerTab model={model} today={today ?? localDateString(new Date())} />}
          {tab === 'seance' && seance && <SeanceTab key={seanceKey} {...seance} onClearData={clearData} />}
        </div>
      ))}
      </div>
    </div>
  );
}
