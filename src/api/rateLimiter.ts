/**
 * Cola de requests con ventana deslizante.
 *
 * Limita *arranques* por ventana (5 por segundo, 40 por minuto), que es como
 * MangaDex cuenta el rate limit. No limita cuántas requests quedan en vuelo:
 * de eso se encarga quien encola.
 */

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class RequestQueue {
  /** Timestamps de los arranques que todavía caen dentro de la ventana. */
  private starts: number[] = [];
  private readonly pending: Array<() => void> = [];
  private pausedUntil = 0;
  private draining = false;

  /**
   * @param limit     arranques permitidos dentro de la ventana.
   * @param windowMs  largo de la ventana.
   * @param name      identificador, para poder distinguir colas al depurar.
   * @param minGapMs  separación mínima entre arranques. En 0 la cola dispara
   *   ráfagas, que es lo que tolera la API; el host de portadas en cambio acepta
   *   5 req/s sólo si vienen parejas y responde 403 a la ráfaga.
   */
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    readonly name: string,
    private readonly minGapMs = 0,
  ) {}

  /**
   * Frena la cola entera durante `ms`. Se usa al recibir un 429: si un request
   * chocó con el límite, los que vienen atrás también van a chocar.
   */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push(() => {
        task().then(resolve, reject);
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        const wait = this.msUntilSlot();
        if (wait > 0) await sleep(wait);
        const job = this.pending.shift();
        if (!job) break;
        this.starts.push(Date.now());
        // Sin `await`: la ventana cuenta arranques, no duraciones.
        job();
      }
    } finally {
      this.draining = false;
    }
  }

  /** Milisegundos hasta que se libere un lugar en la ventana. */
  private msUntilSlot(): number {
    const now = Date.now();
    this.starts = this.starts.filter((t) => now - t < this.windowMs);
    const pause = Math.max(0, this.pausedUntil - now);

    const last = this.starts[this.starts.length - 1];
    const gap = last === undefined ? 0 : Math.max(0, last + this.minGapMs - now);

    if (this.starts.length < this.limit) return Math.max(pause, gap);
    const oldest = this.starts[0] ?? now;
    return Math.max(oldest + this.windowMs - now, pause, gap);
  }
}
