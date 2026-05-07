// core/telemetry/global-error-handler.ts

import {
  APP_INITIALIZER,
  ApplicationConfig,
  ErrorHandler,
  Injectable,
  NgZone,
  inject,
} from '@angular/core';
import { TelemetryService } from './telemetry.service';
import { LogLevel }         from './models/log-entry.model';

const MAX_STACK_BYTES = 4096;

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly telemetry = inject(TelemetryService);
  private readonly zone      = inject(NgZone);

  handleError(raw: unknown): void {
    // Run outside NgZone — logging must never trigger change detection
    this.zone.runOutsideAngular(() => {
      const err = this.normalise(raw);

      this.telemetry.log(LogLevel.ERROR, 'EXCEPTION', err.message, {
        error: {
          name   : err.name,
          message: err.message,
          stack  : this.trimStack(err.stack ?? ''),
          cause  : err.cause != null ? String(err.cause) : null,
        },
      });
    });

    // Preserve default dev-mode console output
    console.error('[GlobalErrorHandler] Unhandled error:', raw);
  }

  private normalise(raw: unknown): Error {
    if (raw instanceof Error) return raw;
    const e  = new Error(typeof raw === 'string' ? raw : JSON.stringify(raw));
    e.name   = 'UnknownError';
    return e;
  }

  private trimStack(stack: string): string {
    return stack.length > MAX_STACK_BYTES
      ? `${stack.slice(0, MAX_STACK_BYTES)}…[trimmed]`
      : stack;
  }
}

// ── Factory for unhandledrejection listener ────────────────────────────────

function unhandledRejectionFactory(telemetry: TelemetryService, zone: NgZone) {
  return () => {
    window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
      zone.runOutsideAngular(() => {
        const reason = ev.reason;
        const err    = reason instanceof Error ? reason : new Error(String(reason));

        telemetry.log(LogLevel.ERROR, 'EXCEPTION',
          `UnhandledPromiseRejection: ${err.message}`, {
            error: {
              name   : 'UnhandledRejection',
              message: err.message,
              stack  : err.stack ?? '',
              cause  : null,
            },
          }
        );
      });
    });
  };
}

// ── Provider helpers for app.config.ts ────────────────────────────────────

export const globalErrorHandlerProviders = [
  { provide: ErrorHandler, useClass: GlobalErrorHandler },
  {
    provide   : APP_INITIALIZER,
    useFactory: unhandledRejectionFactory,
    deps      : [TelemetryService, NgZone],
    multi     : true,
  },
];

/**
 * Usage in app.config.ts:
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     ...globalErrorHandlerProviders,
 *   ],
 * };
 */
