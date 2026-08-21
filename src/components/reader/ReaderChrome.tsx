import { Link } from 'react-router-dom';
import type { FitMode, ReadingMode } from '../../db/schema';

interface ReaderChromeProps {
  visible: boolean;
  mangaId: string | null;
  title: string;
  chapterLabel: string;
  index: number;
  total: number;
  mode: ReadingMode;
  fitMode: FitMode;
  onModeChange: (mode: ReadingMode) => void;
  onFitChange: (fit: FitMode) => void;
  onSeek: (index: number) => void;
}

const MODE_LABEL: Record<ReadingMode, string> = {
  rtl: 'RTL',
  ltr: 'LTR',
  vertical: 'Continuo',
};

const FIT_LABEL: Record<FitMode, string> = {
  width: 'Ancho',
  height: 'Alto',
  original: 'Original',
};

function OptionGroup<T extends string>({
  options,
  value,
  labels,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            onChange(option);
          }}
          aria-pressed={option === value}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            option === value ? 'bg-accent text-ink-900' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'
          }`}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

/** Barras superior e inferior del lector, con auto-hide. */
export default function ReaderChrome({
  visible,
  mangaId,
  title,
  chapterLabel,
  index,
  total,
  mode,
  fitMode,
  onModeChange,
  onFitChange,
  onSeek,
}: ReaderChromeProps) {
  const hidden = visible ? '' : 'pointer-events-none opacity-0';

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-20 flex items-center gap-3 bg-ink-900/90 px-4 py-3 backdrop-blur transition-opacity duration-200 ${hidden}`}
      >
        <Link
          to={mangaId ? `/manga/${mangaId}` : '/'}
          className="shrink-0 text-sm text-ink-400 hover:text-ink-200"
        >
          ← Volver
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-200">{title}</p>
          <p className="truncate text-xs text-ink-400">{chapterLabel}</p>
        </div>
      </header>

      <footer
        className={`fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur transition-opacity duration-200 ${hidden}`}
      >
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs tabular-nums text-ink-400">
            {index + 1} / {total}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={index}
            onChange={(event) => {
              onSeek(Number(event.target.value));
            }}
            aria-label="Ir a la página"
            // En RTL la barra se invierte para que avanzar sea moverse hacia la izquierda.
            className={`h-1 w-full accent-accent ${mode === 'rtl' ? 'rotate-180' : ''}`}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <OptionGroup
            label="Modo de lectura"
            options={['rtl', 'ltr', 'vertical'] as const}
            value={mode}
            labels={MODE_LABEL}
            onChange={onModeChange}
          />
          <OptionGroup
            label="Ajuste de imagen"
            options={['width', 'height', 'original'] as const}
            value={fitMode}
            labels={FIT_LABEL}
            onChange={onFitChange}
          />
        </div>
      </footer>
    </>
  );
}
