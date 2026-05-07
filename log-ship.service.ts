// core/telemetry/queue/log-ship.service.ts

import { Injectable, inject }   from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
}                               from '@angular/common/http';
import { EMPTY, timer }         from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { SKIP_TELEMETRY }       from '../interceptors/api-telemetry.interceptor';
import { TELEMETRY_CONFIG }     from '../telemetry.config';
import { LogBatch }             from '../models/log-entry.model';

/** HTTP status codes that are worth retrying */
const RETRYABLE_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504]);

@Injectable({ providedIn: 'root' })
export class LogShipService {
  private readonly http   = inject(HttpClient);
  private readonly config = inject(TELEMETRY_CONFIG);

  ship(batch: LogBatch): void {
    this.sendWithRetry(batch, 0);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private sendWithRetry(batch: LogBatch, attempt: number): void {
    // SKIP_TELEMETRY prevents ApiTelemetryInterceptor from logging this call
    const context = new HttpContext().set(SKIP_TELEMETRY, true);

    this.http
      .post(this.config.endpoint, batch, {
        context,
        headers: { 'Content-Type': 'application/json' },
      })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const isRetryable = RETRYABLE_STATUSES.has(err.status);
          const canRetry    = isRetryable && attempt < this.config.retry.maxAttempts;

          if (canRetry) {
            const delayMs = this.backoffDelay(attempt);
            console.warn(
              `[Telemetry] Retry ${attempt + 1}/${this.config.retry.maxAttempts}` +
              ` in ${delayMs.toFixed(0)} ms (status ${err.status})`
            );

            return timer(delayMs).pipe(
              switchMap(() => {
                this.sendWithRetry(batch, attempt + 1);
                return EMPTY;
              })
            );
          }

          if (!isRetryable) {
            // 400 / 401 / 403 — discard; no point retrying
            console.error(`[Telemetry] Batch rejected (${err.status}), discarding.`);
          } else {
            // Max retries exhausted — fall back to sendBeacon
            this.beaconFallback(batch);
          }

          return EMPTY;
        })
      )
      .subscribe();
  }

  /**
   * Exponential backoff with ±100 ms jitter to avoid thundering-herd.
   * Delay = baseDelayMs × 2^attempt  +  random(0, 100)
   */
  private backoffDelay(attempt: number): number {
    return (
      this.config.retry.baseDelayMs * Math.pow(2, attempt) +
      Math.random() * 100
    );
  }

  /**
   * navigator.sendBeacon:
   *  - Survives page unload (does not block navigation)
   *  - Queued by the browser even if the tab closes
   *  - No retry on beacon failure — last-resort only
   */
  private beaconFallback(batch: LogBatch): void {
    if (!navigator.sendBeacon) {
      console.warn('[Telemetry] sendBeacon not available; batch lost.');
      return;
    }

    const blob    = new Blob([JSON.stringify(batch)], { type: 'application/json' });
    const queued  = navigator.sendBeacon(this.config.endpoint, blob);

    if (!queued) {
      console.warn('[Telemetry] sendBeacon rejected by browser; batch lost.');
    }
  }
}
