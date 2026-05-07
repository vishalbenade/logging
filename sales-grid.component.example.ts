// features/sales/sales-grid.component.ts
// Example component demonstrating full telemetry framework integration.

import {
  Component,
  OnDestroy,
  OnInit,
  inject,
}                             from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { AgGridAngular }      from 'ag-grid-angular';
import {
  ColDef,
  GridOptions,
  GridReadyEvent,
}                             from 'ag-grid-community';

import { GridTelemetryFacade } from '../../core/telemetry/grid/grid-telemetry.facade';
import { PerfObserverService } from '../../core/telemetry/perf/perf-observer.service';
import { TelemetryService }    from '../../core/telemetry/telemetry.service';
import { LogLevel }            from '../../core/telemetry/models/log-entry.model';

const GRID_ID         = 'sales-grid-main';
const COMPONENT_NAME  = 'SalesGridComponent';

@Component({
  selector   : 'app-sales-grid',
  standalone : true,
  imports    : [AgGridAngular],

  // GridTelemetryFacade is SCOPED to this component instance.
  // Each grid component gets its own facade, isolating context and gridId.
  providers  : [GridTelemetryFacade],

  template: `
    <ag-grid-angular
      class="ag-theme-alpine"
      style="height: 600px; width: 100%;"
      [gridOptions]="gridOptions"
      [rowData]="rowData"
      [columnDefs]="columnDefs"
      (gridReady)="onGridReady($event)"
    />
  `,
})
export class SalesGridComponent implements OnInit, OnDestroy {
  // ── Injected services ──────────────────────────────────────────────────────
  protected readonly facade    = inject(GridTelemetryFacade);
  private   readonly perf      = inject(PerfObserverService);
  private   readonly telemetry = inject(TelemetryService);
  private   readonly http      = inject(HttpClient);

  // ── Grid config ────────────────────────────────────────────────────────────
  protected rowData  : unknown[] = [];

  protected columnDefs: ColDef[] = [
    { field: 'id',       headerName: 'ID',       sortable: true, filter: true },
    { field: 'product',  headerName: 'Product',  sortable: true, filter: true },
    { field: 'amount',   headerName: 'Amount',   sortable: true, filter: true, editable: true },
    { field: 'region',   headerName: 'Region',   sortable: true, filter: true },
    { field: 'status',   headerName: 'Status',   sortable: true, filter: true },
  ];

  protected gridOptions: GridOptions = {
    // gridId is passed via context and read by GridTelemetryFacade
    context        : { gridId: GRID_ID },
    rowSelection   : 'multiple',
    animateRows    : true,
    pagination     : true,
    paginationPageSize: 50,
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadData();
  }

  protected onGridReady(event: GridReadyEvent): void {
    // Attach the facade — this registers all AG Grid event listeners
    this.facade.onGridReady(event, COMPONENT_NAME);

    this.telemetry.log(LogLevel.INFO, 'APP_LIFECYCLE', 'Sales grid initialised', {
      componentName: COMPONENT_NAME,
      gridId       : GRID_ID,
    });
  }

  // ── Data loading with performance measurement ──────────────────────────────

  private loadData(): void {
    // Mark start of data fetch BEFORE the HTTP call
    const startMark = this.perf.markFetchStart(GRID_ID);

    this.http.get<unknown[]>('/api/sales/data').subscribe({
      next: (data) => {
        this.rowData = data;

        // Measure fetch duration AFTER data is assigned to the grid
        this.perf.measureDataFetch(GRID_ID, startMark, COMPONENT_NAME);
      },
      error: (err) => {
        // HttpInterceptor already logs the error — no double-logging needed here.
        // Only add component-specific context if required.
        this.telemetry.log(LogLevel.ERROR, 'APP_LIFECYCLE',
          'Failed to load sales data', {
            componentName: COMPONENT_NAME,
            gridId       : GRID_ID,
            error: {
              name   : err.name,
              message: err.message,
              stack  : err.stack ?? '',
              cause  : null,
            },
          }
        );
      },
    });
  }

  ngOnDestroy(): void {
    // GridTelemetryFacade.ngOnDestroy() is called automatically (component-scoped provider)
  }
}
