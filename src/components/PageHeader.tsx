import type { ReactNode } from 'react';

/** Encabezado de pantalla: mismo peso y mismo respeto por el notch en todas. */
export default function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3 pt-safe">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-200">{title}</h1>
      {action}
    </header>
  );
}
