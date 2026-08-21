import type { ReactNode } from 'react';
import Icon from './Icon';

interface StateMessageProps {
  title: string;
  detail?: string;
  action?: ReactNode;
  /** Se puede cambiar para que el estado vacío hable del contexto. */
  icon?: 'book' | 'search' | 'download' | 'library';
}

/** Pantalla neutra para los estados vacío y de error. */
export default function StateMessage({ title, detail, action, icon = 'book' }: StateMessageProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-800 text-ink-400">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="text-base font-medium text-ink-200">{title}</p>
      {detail ? <p className="max-w-md text-sm leading-relaxed text-ink-400">{detail}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
