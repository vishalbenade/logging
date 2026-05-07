// core/telemetry/grid/grid-telemetry.facade.ts

import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import {
  CellValueChangedEvent,
  ColumnMovedEvent,
  ColumnResizedEvent,
  GridApi,
  GridReadyEvent,
} from 'ag-grid-community';
import { TelemetryService } from '../telemetry.service';
import { LogLevel }         from '../models/log-entry.model';

/**
 * Scoped per-component — declare in the component's `providers` array.
 *
 * @example
 * @Component({
 *   providers: [GridTelemetryFacade],
 *   template: `<ag-grid-angular (gridReady)="facade.onGridReady($event, 'MyComponent')" />`
 * })
 */
@Injectable()
export class GridTelemetryFacade implements OnDestroy {
  private readonly telemetry = inject(TelemetryService);
  private readonly zone      = inject(NgZone);

  private api!          : GridApi;
  private gridId!       : string;
  private componentName!: string;
  private gridReadyMark!: string;

  // ── Attach ─────────────────────────────────────────────────────────────────

  onGridReady(params: GridReadyEvent, componentName: string): void {
    this.api           = params.api;
    this.gridId        = (params.context as { gridId?: string })?.gridId ?? 'unknown';
    this.componentName = componentName;
    this.gridReadyMark = `grid_ready_${this.gridId}_${Date.now()}`;

    // Mark grid init start for firstDataRendered measurement
    performance.mark(this.gridReadyMark);

    // All event listeners run outside NgZone to avoid change-detection cycles
    this.zone.runOutsideAngular(() => this.registerAllEvents());
  }

  // ── Event Registration ─────────────────────────────────────────────────────

  private registerAllEvents(): void {
    this.registerGridStateEvents();
    this.registerUserInteractionEvents();
    this.registerPerformanceEvents();
  }

  private registerGridStateEvents(): void {
    const base = { componentName: this.componentName, gridId: this.gridId };

    // filterChanged ──────────────────────────────────────────────────────────
    this.api.addEventListener('filterChanged', () => {
      this.telemetry.log(LogLevel.INFO, 'GRID_STATE', 'Filter changed', {
        ...base,
        grid: {
          eventType  : 'filterChanged',
          rowCount   : this.api.getDisplayedRowCount(),
          columnId   : null,
          filterModel: this.safeStringify(this.api.getFilterModel()),
          sortModel  : null,
        },
      });
    });

    // sortChanged ────────────────────────────────────────────────────────────
    this.api.addEventListener('sortChanged', () => {
      this.telemetry.log(LogLevel.INFO, 'GRID_STATE', 'Sort changed', {
        ...base,
        grid: {
          eventType  : 'sortChanged',
          rowCount   : this.api.getDisplayedRowCount(),
          columnId   : null,
          filterModel: null,
          sortModel  : this.api
            .getColumnState()
            .filter(c => !!c.sort)
            .map(c => ({ colId: c.colId, sort: c.sort! as 'asc' | 'desc' })),
        },
      });
    });

    // columnResized — only log on drag finish, not every pixel ────────────────
    this.api.addEventListener('columnResized', (e: ColumnResizedEvent) => {
      if (!e.finished) return;

      this.telemetry.log(LogLevel.DEBUG, 'GRID_STATE', 'Column resized', {
        ...base,
        grid: {
          eventType  : 'columnResized',
          rowCount   : null,
          columnId   : e.column?.getId() ?? null,
          filterModel: null,
          sortModel  : null,
        },
        data: { newWidth: e.column?.getActualWidth() ?? null },
      });
    });

    // columnMoved ────────────────────────────────────────────────────────────
    this.api.addEventListener('columnMoved', (e: ColumnMovedEvent) => {
      this.telemetry.log(LogLevel.DEBUG, 'GRID_STATE', 'Column moved', {
        ...base,
        grid: {
          eventType  : 'columnMoved',
          rowCount   : null,
          columnId   : e.column?.getId() ?? null,
          filterModel: null,
          sortModel  : null,
        },
        data: { toIndex: e.toIndex ?? null },
      });
    });
  }

  private registerUserInteractionEvents(): void {
    const base = { componentName: this.componentName, gridId: this.gridId };

    // cellValueChanged — NEVER log old/new cell values (potential PII) ─────────
    this.api.addEventListener('cellValueChanged', (e: CellValueChangedEvent) => {
      this.telemetry.log(LogLevel.INFO, 'USER_INTERACTION', 'Cell edited', {
        ...base,
        grid: {
          eventType  : 'cellValueChanged',
          rowCount   : null,
          columnId   : e.column.getId(),
          filterModel: null,
          sortModel  : null,
        },
        data: { rowIndex: e.rowIndex },
      });
    });

    // rowSelected — DEBUG level; high frequency on bulk select ────────────────
    this.api.addEventListener('rowSelected', (e) => {
      this.telemetry.log(LogLevel.DEBUG, 'USER_INTERACTION', 'Row selected', {
        ...base,
        grid: {
          eventType  : 'rowSelected',
          rowCount   : null,
          columnId   : null,
          filterModel: null,
          sortModel  : null,
        },
        data: {
          rowIndex: (e as any).rowIndex,
          selected: (e as any).node?.isSelected() ?? null,
        },
      });
    });

    // selectionChanged — aggregate event; prefer over rowSelected in production
    this.api.addEventListener('selectionChanged', () => {
      this.telemetry.log(LogLevel.INFO, 'USER_INTERACTION', 'Selection changed', {
        ...base,
        grid: {
          eventType  : 'selectionChanged',
          rowCount   : this.api.getSelectedRows().length,
          columnId   : null,
          filterModel: null,
          sortModel  : null,
        },
      });
    });
  }

  private registerPerformanceEvents(): void {
    const base = { componentName: this.componentName, gridId: this.gridId };

    // firstDataRendered — measures time from gridReady to first render ─────────
    this.api.addEventListener('firstDataRendered', () => {
      try {
        const measureName = `grid_render_${this.gridId}`;
        const measure     = performance.measure(measureName, this.gridReadyMark);

        this.telemetry.log(LogLevel.INFO, 'PERFORMANCE', 'Grid first render complete', {
          ...base,
          perf: {
            name      : 'grid.firstRender',
            durationMs: Math.round(measure.duration),
            entryType : 'measure',
            detail    : { gridId: this.gridId },
          },
        });

        // Clean up performance marks to avoid memory accumulation
        performance.clearMarks(this.gridReadyMark);
        performance.clearMeasures(measureName);
      } catch {
        // performance.measure may throw if mark is missing in some environments
      }
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private safeStringify(obj: unknown): string | null {
    try   { return JSON.stringify(obj); }
    catch { return null; }
  }

  ngOnDestroy(): void {
    // AG Grid cleans up its own event listeners on grid destroy.
    // No manual removeEventListener needed for gridApi listeners.
  }
}
