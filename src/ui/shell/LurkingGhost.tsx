import { useEffect, useRef, useState } from 'react';
import { createReducedMotion } from '../../haunts/engine/gate/reducedMotion';
import { shellEffects, type ShellEffects } from '../shellEffects';
import { useHauntSettings } from '../useHauntSettings';
import {
  isDemoMode,
  nextPeekDelayMs,
  pickPeek,
  PEEK_VISIBLE_MS,
  type Peek,
} from './ghostPlacement';
import './LurkingGhost.css';

function useReducedMotion(): boolean {
  const [adapter] = useState(() => createReducedMotion());
  const [reduced, setReduced] = useState(() => adapter.get());
  useEffect(() => adapter.subscribe(setReduced), [adapter]);
  return reduced;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** True while the Opening_Transition is on screen, that is, while a book is loading. */
function bookIsOpening(): boolean {
  return document.querySelector('.opening') !== null;
}

/** True until the first Peek of this page load has been shown. Module-level so a return to the Library tab does not count as first. */
let firstPeekPending = true;

/**
 * A ghost that peeks from a screen edge on the Library tab, every 45 to 90
 * seconds (Demo_Mode, `?demo=1`: 3 seconds for the first, then 4 to 6). Mount it only while the Library
 * tab is showing: unmounting cancels every timer, and mounting again schedules
 * a fresh Peek. Silent, decorative, never focusable, and takes no pointer
 * events except a reach check. Nothing is stored.
 */
export function LurkingGhost({ effects = shellEffects }: { effects?: ShellEffects }) {
  const { settings } = useHauntSettings();
  const reduced = useReducedMotion();
  const visible = useDocumentVisible();
  const enabled = settings.mode !== 'gentle' && !reduced && visible;
  const [demo] = useState(() => isDemoMode(window.location.search));
  const [peek, setPeek] = useState<Peek | null>(null);
  const peekRef = useRef<Peek | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const show = (p: Peek | null) => {
      peekRef.current = p;
      setPeek(p);
    };
    const schedule = () => {
      delayTimer = setTimeout(start, nextPeekDelayMs(Math.random(), demo, firstPeekPending, effects));
    };
    const end = () => {
      clearTimeout(hideTimer);
      show(null);
      schedule();
    };
    function start() {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const p = bookIsOpening() ? null : pickPeek(document, viewport, Math.random(), effects);
      if (!p) {
        schedule();
        return;
      }
      firstPeekPending = false;
      show(p);
      hideTimer = setTimeout(end, PEEK_VISIBLE_MS);
    }
    const onPointer = (e: PointerEvent) => {
      const p = peekRef.current;
      if (!p) return;
      const { left, right, top, bottom } = p.rect;
      if (e.clientX >= left && e.clientX <= right && e.clientY >= top && e.clientY <= bottom) end();
    };

    schedule();
    window.addEventListener('pointermove', onPointer);
    return () => {
      clearTimeout(delayTimer);
      clearTimeout(hideTimer);
      window.removeEventListener('pointermove', onPointer);
      peekRef.current = null;
      setPeek(null);
    };
  }, [enabled, demo, effects]);

  if (!enabled || !peek) return null;
  const { rect } = peek;
  return (
    <div
      className={`lurking-ghost lurking-ghost--${peek.side}`}
      style={{ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }}
      aria-hidden="true"
    >
      <img className="lurking-ghost__image" src={peek.url} alt="" draggable={false} />
    </div>
  );
}
