// core/telemetry/perf/perf-observer.service.ts

import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { TelemetryService }                      from '../telemetry.service';
import { LogLevel }                              from '../models/log-entry.model';

/** Minimum long-task duration to log (ms) */
const LONG_TASK_THRESHOLD_MS = 50;

@Injectable({ providedIn: 'root' })
export class PerfObserverService implements OnDestroy {
  private readonly telemetry = inject(TelemetryService);
  private readonly zone      = inject(NgZone);

  private observer: PerformanceObserver | null = null;

  constructor() {
    this.zone.runOutsideAngular(() => this.initLongTaskObserver());
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Mark the start of a data-fetch operation.
   * Call before the HTTP request fires.
   */
  markFetchStart(gridId: string): string {
    const mark = `data_fetch_start_${gridId}_${Date.now()}`;
    performance.mark(mark);
    return mark;
  }

  /**
   * Measure and log data-fetch duration.
   * Call after the HTTP response is bound to the grid.
   *
   * @param gridId        Grid identifier (same as used in markFetchStart)
   * @param startMark     Return value from markFetchStart()
   * @param componentName Optional — logged as context
   */
  measureDataFetch(
    gridId       : string,
    startMark    : string,
    componentName: string = ''
  ): void {
    try {
      const measureName = `data_fetch_${gridId}`;
      const measure     = performance.measure(measureName, startMark);

      this.telemetry.log(LogLevel.INFO, 'PERFORMANCE', 'Data fetch complete', {
        componentName,
        gridId,
        perf: {
          name      : 'data.fetchDuration',
          durationMs: Math.round(measure.duration),
          entryType : 'measure',
          detail    : { gridId, startMark },
        },
      });

      // Clean up to avoid memory leaks in long-running sessions
      performance.clearMarks(startMark);
      performance.clearMeasures(measureName);
    } catch (err) {
      // performance.measure throws if startMark no longer exists
      console.debug('[PerfObserver] measureDataFetch failed:', err);
    }
  }

  /**
   * Manually record an arbitrary performance metric.
   * Useful for custom timings (e.g. export generation, complex computations).
   */
  recordMetric(name: string, durationMs: number, detail?: Record<string, unknown>): void {
    this.telemetry.log(LogLevel.INFO, 'PERFORMANCE', name, {
      perf: {
        name,
        durationMs: Math.round(durationMs),
        entryType : 'custom',
        detail    : detail ?? null,
      },
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private initLongTaskObserver(): void {
    if (!('PerformanceObserver' in window)) return;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < LONG_TASK_THRESHOLD_MS) continue;

          this.telemetry.log(LogLevel.WARN, 'PERFORMANCE', 'Long task detected', {
            perf: {
              name      : 'browser.longTask',
              durationMs: Math.round(entry.duration),
              entryType : 'longtask',
              detail    : {
                startTime     : Math.round(entry.startTime),
                taskAttribution: (entry as any).attribution ?? null,
              },
            },
          });
        }
      });

      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // `longtask` entryType is not supported in all browsers (e.g. Firefox/Safari)
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
