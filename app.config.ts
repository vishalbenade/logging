// app.config.ts
// Complete Angular 19 application configuration wiring the telemetry framework.

import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter }       from '@angular/router';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
}                              from '@angular/common/http';

import { routes }                    from './app.routes';
import { globalErrorHandlerProviders } from './core/telemetry/global-error-handler';
import { ApiTelemetryInterceptor }   from './core/telemetry/interceptors/api-telemetry.interceptor';
import { TELEMETRY_CONFIG }          from './core/telemetry/telemetry.config';
import { LogLevel }                  from './core/telemetry/models/log-entry.model';

export const appConfig: ApplicationConfig = {
  providers: [
    // ── Angular core ─────────────────────────────────────────────────────────
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),

    // ── Telemetry: error handling ─────────────────────────────────────────────
    ...globalErrorHandlerProviders,

    // ── Telemetry: HTTP interceptor ───────────────────────────────────────────
    {
      provide : HTTP_INTERCEPTORS,
      useClass: ApiTelemetryInterceptor,
      multi   : true,
    },

    // ── Telemetry: runtime configuration override ─────────────────────────────
    // Remove or adjust this block to use the default factory in telemetry.config.ts
    {
      provide : TELEMETRY_CONFIG,
      useValue: {
        minLevel    : LogLevel.INFO,
        endpoint    : '/api/v1/logs',
        maxQueueSize: 500,
        batch: {
          maxSizeBytes: 65_536,
          maxEntries  : 100,
          intervalMs  : 10_000,
        },
        retry: {
          maxAttempts: 3,
          baseDelayMs: 500,
        },
        sensitiveKeys: [
          'password', 'token', 'authorization',
          'ssn', 'creditCard', 'secret', 'apiKey',
          'refreshToken', 'accessToken',
        ],
        sampling: {
          DEBUG: 0,     // disabled in production; enable via TelemetryService.enableDebugMode()
          INFO : 1,
          WARN : 1,
          ERROR: 1,
        },
      },
    },
  ],
};
