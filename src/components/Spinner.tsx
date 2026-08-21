export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-400">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-ink-600 border-t-accent"
        role="status"
        aria-label="Cargando"
      />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
