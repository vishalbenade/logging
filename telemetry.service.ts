// core/telemetry/telemetry.service.ts

import { Injectable, inject } from '@angular/core';
import { ContextService }     from './context.service';
import { LogQueueService }    from './queue/log-queue.service';
import { TELEMETRY_CONFIG }   from './telemetry.config';
import {
  LogCategory,
  LogEntry,
  LogLevel,
} from './models/log-entry.model';

const SDK_VERSION = '1.2.0';

type LogOptions = Partial<
  Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'category' | 'message' | 'context' | '_meta'>
> & {
  componentName?: string;
  gridId?       : string | null;
};

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly queue  = inject(LogQueueService);
  private readonly ctx    = inject(ContextService);
  private readonly config = inject(TELEMETRY_CONFIG);

  private seqNo = 0;

  // ── Public API ─────────────────────────────────────────────────────────────

  log(
    level   : LogLevel,
    category: LogCategory,
    message : string,
    options : LogOptions = {}
  ): void {
    if (level < this.config.minLevel)  return;
    if (!this.shouldSample(level))      return;

    const { componentName, gridId, ...rest } = options;

    const entry: LogEntry = {
      id       : `log_${crypto.randomUUID().slice(0, 10)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data     : rest.data ?? null,
      context  : this.ctx.getContext(componentName ?? '', gridId ?? null),
      _meta    : {
        sdkVersion: SDK_VERSION,
        batchId   : '',           // filled by LogQueueService on flush
        seqNo     : this.seqNo++,
        dropped   : false,
      },
      ...rest,
    };

    this.queue.enqueue(entry);
  }

  debug(msg: string, opts?: LogOptions): void {
    this.log(LogLevel.DEBUG, 'CUSTOM', msg, opts);
  }

  info(msg: string, opts?: LogOptions): void {
    this.log(LogLevel.INFO, 'CUSTOM', msg, opts);
  }

  warn(msg: string, opts?: LogOptions): void {
    this.log(LogLevel.WARN, 'CUSTOM', msg, opts);
  }

  error(msg: string, opts?: LogOptions): void {
    this.log(LogLevel.ERROR, 'CUSTOM', msg, opts);
  }

  // ── Runtime level control ──────────────────────────────────────────────────

  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  enableDebugMode(): void {
    this.config.minLevel       = LogLevel.DEBUG;
    this.config.sampling.DEBUG = 1;
  }

  disableDebugMode(): void {
    this.config.minLevel       = LogLevel.INFO;
    this.config.sampling.DEBUG = 0.1;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private shouldSample(level: LogLevel): boolean {
    const rates: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: this.config.sampling.DEBUG,
      [LogLevel.INFO ]: this.config.sampling.INFO,
      [LogLevel.WARN ]: this.config.sampling.WARN,
      [LogLevel.ERROR]: this.config.sampling.ERROR,
    };
    return Math.random() < (rates[level] ?? 1);
  }
}
