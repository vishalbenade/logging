// core/telemetry/telemetry.config.ts

import { InjectionToken } from '@angular/core';
import { LogLevel }       from './models/log-entry.model';

export interface TelemetryConfig {
  minLevel      : LogLevel;
  endpoint      : string;
  maxQueueSize  : number;
  batch: {
    maxSizeBytes: number;
    maxEntries  : number;
    intervalMs  : number;
  };
  retry: {
    maxAttempts : number;
    baseDelayMs : number;
  };
  sensitiveKeys : string[];
  sampling: {
    DEBUG: number;
    INFO : number;
    WARN : number;
    ERROR: number;
  };
}

export const TELEMETRY_CONFIG = new InjectionToken<TelemetryConfig>(
  'TELEMETRY_CONFIG',
  {
    providedIn: 'root',
    factory: (): TelemetryConfig => ({
      minLevel    : LogLevel.INFO,
      endpoint    : '/api/v1/logs',
      maxQueueSize: 500,
      batch: {
        maxSizeBytes: 65_536,   // 64 KB
        maxEntries  : 100,
        intervalMs  : 10_000,   // 10 s
      },
      retry: {
        maxAttempts: 3,
        baseDelayMs: 500,
      },
      sensitiveKeys: [
        'password', 'token', 'authorization',
        'ssn', 'creditCard', 'secret', 'apiKey',
      ],
      sampling: {
        DEBUG: 0.1,   // 10 % in production
        INFO : 1,
        WARN : 1,
        ERROR: 1,
      },
    }),
  }
);
