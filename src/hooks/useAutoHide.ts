import { useCallback, useEffect, useRef, useState } from 'react';

interface AutoHide {
  visible: boolean;
  show: () => void;
  toggle: () => void;
}

/**
 * Visibilidad de las barras del lector: se esconden solas y vuelven al mover el
 * mouse. El temporizador se reinicia en cada aparición para que no desaparezcan
 * justo cuando el usuario va a tocar un botón.
 */
export function useAutoHide(delay = 2_500): AutoHide {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setVisible(false);
    }, delay);
  }, [delay]);

  const show = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggle = useCallback(() => {
    setVisible((current) => {
      if (current) {
        if (timer.current) clearTimeout(timer.current);
        return false;
      }
      scheduleHide();
      return true;
    });
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    const onMouseMove = (): void => {
      show();
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scheduleHide, show]);

  return { visible, show, toggle };
}
