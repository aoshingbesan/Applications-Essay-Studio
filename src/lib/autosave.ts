export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export interface AutosaveQueueOptions<T> {
  save: (value: T) => Promise<boolean>;
  delay: number;
  onState: (state: SaveState, savedAt?: Date) => void;
}

/**
 * Debounced, non-overlapping save queue. `schedule` records the latest value and saves it after
 * `delay` ms of inactivity. Only one save runs at a time; a value changed during a save is saved
 * afterwards. A failed save keeps the value so `flush` (retry) or the next change saves it.
 */
export class AutosaveQueue<T> {
  private pending: { value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly options: AutosaveQueueOptions<T>) {}

  get hasPending(): boolean {
    return this.pending !== null || this.inFlight !== null;
  }

  schedule(value: T) {
    this.pending = { value };
    this.options.onState("pending");
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.options.delay);
  }

  async flush(): Promise<void> {
    this.clearTimer();
    await this.run();
  }

  dispose() {
    this.clearTimer();
  }

  /** The value not yet saved, if any (used to save synchronously on unmount). */
  takePending(): T | null {
    const p = this.pending;
    this.pending = null;
    this.clearTimer();
    return p ? p.value : null;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    while (this.inFlight) await this.inFlight;
    const next = this.pending;
    if (!next) return;
    this.pending = null;
    this.options.onState("saving");
    const attempt = (async () => {
      let ok = false;
      try {
        ok = await this.options.save(next.value);
      } catch {
        ok = false;
      }
      if (ok) {
        this.options.onState(this.pending ? "pending" : "saved", new Date());
      } else {
        if (!this.pending) this.pending = next;
        this.options.onState("error");
      }
    })();
    this.inFlight = attempt;
    try {
      await attempt;
    } finally {
      this.inFlight = null;
    }
  }
}
