import { Link } from 'react-router-dom';
import type { FitMode, ReadingMode } from '../../db/schema';
import Icon from '../Icon';

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
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            onChange(option);
          }}
          aria-pressed={option === value}
          className={`rounded-full px-3 py-1.5 text-xs transition-colors active:scale-[0.97] ${
            option === value
              ? 'bg-accent font-medium text-ink-900'
              : 'bg-ink-800/80 text-ink-200 hover:bg-ink-700'
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
        className={`fixed inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-ink-900 via-ink-900/95 to-transparent px-4 pb-10 pt-safe transition-opacity duration-200 ${hidden}`}
      >
        <Link
          to={mangaId ? `/manga/${mangaId}` : '/'}
          aria-label="Volver a la obra"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900/60 text-ink-200 backdrop-blur hover:text-accent"
        >
          <Icon name="back" className="h-5 w-5" />
        </Link>
        <div className="min-w-0 [text-shadow:0_1px_3px_rgb(11_11_15/0.9)]">
          <p className="truncate text-sm font-medium text-ink-200">{title}</p>
          <p className="truncate text-xs text-ink-200/70">{chapterLabel}</p>
        </div>
      </header>

      <footer
        className={`fixed inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-4 pb-safe pt-8 transition-opacity duration-200 ${hidden}`}
      >
        <div className="flex items-center gap-3">
          <span className="shrink-0 rounded-full bg-ink-900/70 px-2 py-0.5 text-xs tabular-nums text-ink-200">
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

        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          <OptionGroup
            label="Modo de lectura"
            options={['rtl', 'ltr', 'vertical'] as const}
            value={mode}
            labels={MODE_LABEL}
            onChange={onModeChange}
          />
          <span aria-hidden className="h-5 w-px shrink-0 bg-ink-600" />
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
