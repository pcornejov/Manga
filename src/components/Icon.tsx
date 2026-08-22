interface IconProps {
  name: keyof typeof PATHS;
  className?: string;
}

/**
 * Iconos como paths sueltos.
 *
 * Son once: una librería de iconos pesaría más que todo esto y traería una
 * dependencia sólo para dibujar flechas.
 */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  library: 'M4 4h5v16H4zM11 4h4v16h-4zM17.5 4.5l3 15',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 19h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  back: 'M15 19l-7-7 7-7',
  check: 'M4 12.5 9 17.5 20 6.5',
  star: 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 9.9l6-.8z',
  chevron: 'M9 6l6 6-6 6',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 5.5v15',
  close: 'M6 6l12 12M18 6L6 18',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.7 19.5l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1A1.7 1.7 0 0 0 4.5 13H4a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5.7 6.6l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H11a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
} as const;

export default function Icon({ name, className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
