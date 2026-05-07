// core/telemetry/context.service.ts

import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LogContext } from './models/log-entry.model';

/** Stable hash to avoid storing raw user IDs in logs */
function hashUserId(raw: string): string {
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

@Injectable({ providedIn: 'root' })
export class ContextService {
  private readonly router    = inject(Router);
  private readonly sessionId = `sess_${crypto.randomUUID().slice(0, 10)}`;

  private currentRoute = '/';
  private userId       : string | null = null;
  private tenantId     : string | null = null;

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => {
        this.currentRoute = e.urlAfterRedirects;
      });

    this.tenantId = this.resolveTenant();
  }

  /** Call after authentication — accepts opaque ID, never raw PII */
  setUser(userId: string | null): void {
    this.userId = userId ? `usr_obf_${hashUserId(userId)}` : null;
  }

  setTenant(tenantId: string | null): void {
    this.tenantId = tenantId;
  }

  getContext(componentName = '', gridId: string | null = null): LogContext {
    return {
      sessionId,
      userId       : this.userId,
      tenantId     : this.tenantId,
      route        : this.currentRoute,
      componentName,
      gridId,
    };
  }

  private resolveTenant(): string | null {
    const sub = window.location.hostname.split('.')[0];
    return sub && sub !== 'localhost' ? sub : null;
  }
}
