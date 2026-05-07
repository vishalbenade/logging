// core/telemetry/queue/log-queue.service.ts

import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { interval, Subscription }                from 'rxjs';
import { LogShipService }                        from './log-ship.service';
import { TELEMETRY_CONFIG }                      from '../telemetry.config';
import { LogBatch, LogEntry, LogLevel }          from '../models/log-entry.model';

declare const APP_VERSION: string;    // provided by build-time DefinePlugin / angular.json

@Injectable({ providedIn: 'root' })
export class LogQueueService implements OnDestroy {
  private readonly shipper = inject(LogShipService);
  private readonly config  = inject(TELEMETRY_CONFIG);
  private readonly zone    = inject(NgZone);

  private queue: LogEntry[] = [];
  private timerSub!: Subscription;

  constructor() {
    this.zone.runOutsideAngular(() => this.initBatchingStrategies());
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  enqueue(entry: LogEntry): void {
    // ── Cap queue; drop oldest entry and flag it ─────────────────────────────
    if (this.queue.length >= this.config.maxQueueSize) {
      const oldest = this.queue.shift();
      if (oldest) oldest._meta.dropped = true;
    }

    this.queue.push(entry);

    // ── Strategy 1: Entry-count threshold ────────────────────────────────────
    if (this.queue.length >= this.config.batch.maxEntries) {
      this.flush('size:entries');
      return;
    }

    // ── Strategy 2: Byte-size threshold ──────────────────────────────────────
    if (this.estimateBatchBytes() >= this.config.batch.maxSizeBytes) {
      this.flush('size:bytes');
      return;
    }

    // ── Strategy 3: Immediate flush on ERROR ─────────────────────────────────
    if (entry.level === LogLevel.ERROR) {
      this.flush('event:error');
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private initBatchingStrategies(): void {
    // ── Strategy 1 (time): periodic flush ────────────────────────────────────
    this.timerSub = interval(this.config.batch.intervalMs).subscribe(() => {
      if (this.queue.length > 0) this.flush('time');
    });

    // ── Flush on tab backgrounding / page close (best-effort) ─────────────────
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.queue.length > 0) {
        this.flush('unload:visibility');
      }
    });

    window.addEventListener('pagehide', () => {
      if (this.queue.length > 0) this.flush('unload:pagehide');
    });
  }

  private flush(reason: string): void {
    if (this.queue.length === 0) return;

    const batchId = `b_${crypto.randomUUID().slice(0, 10)}`;
    // Drain entire queue atomically
    const entries = this.queue.splice(0, this.queue.length);
    entries.forEach(e => (e._meta.batchId = batchId));

    const batch: LogBatch = {
      batchId,
      clientTime  : new Date().toISOString(),
      appVersion  : typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown',
      flushReason : reason,
      entries,
    };

    this.shipper.ship(batch);
  }

  /**
   * Rough byte estimate without full JSON.stringify on every enqueue.
   * Uses string-length as a fast proxy (1 char ≈ 1–2 bytes for typical JSON).
   */
  private estimateBatchBytes(): number {
    return this.queue.reduce(
      (acc, e) => acc + JSON.stringify(e).length,
      0
    );
  }

  ngOnDestroy(): void {
    this.timerSub?.unsubscribe();
    this.flush('destroy');
  }
}
