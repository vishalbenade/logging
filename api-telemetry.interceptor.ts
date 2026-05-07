// core/telemetry/interceptors/api-telemetry.interceptor.ts

import { Injectable, inject }         from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
}                                     from '@angular/common/http';
import { Observable }                 from 'rxjs';
import { tap, catchError }            from 'rxjs/operators';
import { throwError }                 from 'rxjs';
import { TelemetryService }           from '../telemetry.service';
import { TELEMETRY_CONFIG }           from '../telemetry.config';
import { LogLevel }                   from '../models/log-entry.model';

/**
 * Set this token on any HttpRequest that originates from LogShipService
 * to prevent an infinite interception loop.
 *
 * Usage:
 *   this.http.post(url, body, { context: new HttpContext().set(SKIP_TELEMETRY, true) })
 */
export const SKIP_TELEMETRY = new HttpContextToken<boolean>(() => false);

@Injectable()
export class ApiTelemetryInterceptor implements HttpInterceptor {
  private readonly telemetry = inject(TelemetryService);
  private readonly config    = inject(TELEMETRY_CONFIG);

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {

    // Break potential infinite loop for log-ship requests
    if (req.context.get(SKIP_TELEMETRY)) {
      return next.handle(req);
    }

    const requestId = `req_${crypto.randomUUID().slice(0, 10)}`;
    const startTime = performance.now();
    const safeUrl   = this.sanitiseUrl(req.url);

    // ── Log outbound request ─────────────────────────────────────────────────
    this.telemetry.log(LogLevel.DEBUG, 'API_REQUEST',
      `${req.method} ${safeUrl}`, {
        api: {
          requestId,
          method    : req.method,
          url       : safeUrl,
          status    : null,
          reqSizeB  : this.measurePayload(req.body),
          resSizeB  : 0,
          durationMs: 0,
        },
      }
    );

    return next.handle(req).pipe(
      tap((event: HttpEvent<unknown>) => {
        if (event instanceof HttpResponse) {
          this.logResponse(requestId, req, event, startTime, safeUrl);
        }
      }),
      catchError((err: HttpErrorResponse) => {
        this.logError(requestId, req, err, startTime, safeUrl);
        return throwError(() => err);
      })
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private logResponse(
    requestId: string,
    req      : HttpRequest<unknown>,
    res      : HttpResponse<unknown>,
    start    : number,
    safeUrl  : string,
  ): void {
    const durationMs = Math.round(performance.now() - start);
    const level      = res.status >= 400 ? LogLevel.WARN : LogLevel.INFO;

    this.telemetry.log(level, 'API_RESPONSE',
      `${req.method} ${safeUrl} → ${res.status}`, {
        api: {
          requestId,
          method    : req.method,
          url       : safeUrl,
          status    : res.status,
          reqSizeB  : this.measurePayload(req.body),
          resSizeB  : this.measurePayload(res.body),
          durationMs,
        },
      }
    );
  }

  private logError(
    requestId: string,
    req      : HttpRequest<unknown>,
    err      : HttpErrorResponse,
    start    : number,
    safeUrl  : string,
  ): void {
    const durationMs = Math.round(performance.now() - start);

    this.telemetry.log(LogLevel.ERROR, 'API_RESPONSE',
      `${req.method} ${safeUrl} → ${err.status || 'NetworkError'}`, {
        api: {
          requestId,
          method    : req.method,
          url       : safeUrl,
          status    : err.status ?? null,
          reqSizeB  : this.measurePayload(req.body),
          resSizeB  : this.measurePayload(err.error),
          durationMs,
        },
        error: {
          name   : err.name,
          message: err.message,
          stack  : '',
          cause  : null,
        },
      }
    );
  }

  /** Remove sensitive query parameters from URL */
  private sanitiseUrl(raw: string): string {
    try {
      const u       = new URL(raw, window.location.origin);
      const blocked = new Set(this.config.sensitiveKeys.map(k => k.toLowerCase()));
      u.searchParams.forEach((_, key) => {
        if (blocked.has(key.toLowerCase())) {
          u.searchParams.set(key, '[REDACTED]');
        }
      });
      return u.pathname + (u.search || '');
    } catch {
      return raw.split('?')[0];   // fallback: strip entire query string
    }
  }

  /** Measure byte size of scrubbed payload */
  private measurePayload(body: unknown): number {
    if (body == null) return 0;
    try {
      const scrubbed = this.scrubObject(body);
      return new TextEncoder().encode(JSON.stringify(scrubbed)).length;
    } catch {
      return -1;
    }
  }

  private scrubObject(obj: unknown, depth = 0): unknown {
    if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
    const blocked = new Set(this.config.sensitiveKeys.map(k => k.toLowerCase()));
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        blocked.has(k.toLowerCase()) ? '[REDACTED]' : this.scrubObject(v, depth + 1),
      ])
    );
  }
}
