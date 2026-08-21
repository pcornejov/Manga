import type { ReactNode } from 'react';

interface StateMessageProps {
  title: string;
  detail?: string;
  action?: ReactNode;
}

/** Pantalla neutra para los estados vacío y de error. */
export default function StateMessage({ title, detail, action }: StateMessageProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-base font-medium text-ink-200">{title}</p>
      {detail ? <p className="max-w-md text-sm text-ink-400">{detail}</p> : null}
      {action ? <div className="pt-3">{action}</div> : null}
    </div>
  );
}
