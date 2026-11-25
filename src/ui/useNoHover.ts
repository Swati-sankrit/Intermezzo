import { useEffect, useState } from 'react';

const QUERY = '(hover: none)';

/** True on devices whose primary input cannot hover (touch screens). */
export function useNoHover(): boolean {
  const [noHover, setNoHover] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const update = () => setNoHover(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return noHover;
}
