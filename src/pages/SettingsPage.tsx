import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LANGUAGE_OPTIONS,
  RATING_OPTIONS,
  catalogFilters,
  loadCatalogFilters,
  saveCatalogFilters,
} from '../api/filters';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';

/** Alterna un valor dentro de una lista, conservando el orden de las opciones. */
function toggle(list: string[], code: string, order: readonly string[]): string[] {
  const next = list.includes(code) ? list.filter((item) => item !== code) : [...list, code];
  return [...order].filter((item) => next.includes(item));
}

export default function SettingsPage() {
  const [languages, setLanguages] = useState<string[]>([]);
  const [rating, setRating] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    void loadCatalogFilters().then(() => {
      setLanguages(catalogFilters().languages);
      setRating(catalogFilters().contentRating);
    });
  }, []);

  const aplicar = (nextLanguages: string[], nextRating: string[]): void => {
    setLanguages(nextLanguages);
    setRating(nextRating);
    void saveCatalogFilters({ languages: nextLanguages, contentRating: nextRating }).then(() => {
      setGuardado(true);
    });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-safe-nav">
      <PageHeader title="Ajustes" />

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-400">
          Idiomas
        </h2>
        <p className="mb-3 text-xs text-ink-400">
          En este orden: el primero que tenga capítulos es el que se abre. Sacar el inglés
          achica bastante el catálogo.
        </p>
        <ul className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const activo = languages.includes(option.code);
            return (
              <li key={option.code}>
                <button
                  type="button"
                  aria-pressed={activo}
                  onClick={() => {
                    aplicar(
                      toggle(languages, option.code, LANGUAGE_OPTIONS.map((item) => item.code)),
                      rating,
                    );
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                    activo
                      ? 'bg-accent font-medium text-ink-900'
                      : 'bg-ink-700 text-ink-200 hover:bg-ink-600'
                  }`}
                >
                  {activo ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-400">
          Contenido
        </h2>
        <p className="mb-3 text-xs text-ink-400">Qué clasificaciones aparecen en el catálogo.</p>
        <ul className="flex flex-col gap-2">
          {RATING_OPTIONS.map((option) => {
            const activo = rating.includes(option.code);
            return (
              <li key={option.code}>
                <button
                  type="button"
                  aria-pressed={activo}
                  onClick={() => {
                    aplicar(
                      languages,
                      toggle(rating, option.code, RATING_OPTIONS.map((item) => item.code)),
                    );
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3 text-left transition-colors hover:bg-ink-700"
                >
                  <span className="flex flex-col">
                    <span className="text-sm text-ink-200">{option.label}</span>
                    {option.hint ? (
                      <span className="text-[11px] text-ink-400">{option.hint}</span>
                    ) : null}
                  </span>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      activo ? 'bg-accent text-ink-900' : 'border border-ink-600 text-transparent'
                    }`}
                  >
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {guardado ? (
        <p className="rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3 text-sm text-ink-400">
          Guardado. Los cambios se aplican en las próximas búsquedas;{' '}
          <Link to="/" className="text-accent hover:underline">
            volvé al inicio
          </Link>{' '}
          para verlos.
        </p>
      ) : null}
    </main>
  );
}
