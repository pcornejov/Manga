import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Aviso de versión nueva.
 *
 * El Service Worker se registra en modo `prompt`, así que la versión nueva queda
 * esperando en vez de recargar sola: con la app instalada, una recarga a mitad de
 * un capítulo es peor que un cartel.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-ink-600 bg-ink-800 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg">
      <span className="text-sm text-ink-200">Hay una versión nueva.</span>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => {
            setNeedRefresh(false);
          }}
          className="rounded px-3 py-1.5 text-xs text-ink-400 hover:text-ink-200"
        >
          Después
        </button>
        <button
          type="button"
          onClick={() => {
            void updateServiceWorker(true);
          }}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-ink-900"
        >
          Actualizar
        </button>
      </span>
    </div>
  );
}
