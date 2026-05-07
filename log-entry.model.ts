// core/telemetry/models/log-entry.model.ts

export enum LogLevel {
  DEBUG = 0,
  INFO  = 1,
  WARN  = 2,
  ERROR = 3,
}

export type LogCategory =
  | 'EXCEPTION'
  | 'API_REQUEST'
  | 'API_RESPONSE'
  | 'GRID_STATE'
  | 'USER_INTERACTION'
  | 'PERFORMANCE'
  | 'APP_LIFECYCLE'
  | 'CUSTOM';

export type GridEventType =
  | 'filterChanged'
  | 'sortChanged'
  | 'columnResized'
  | 'columnMoved'
  | 'cellValueChanged'
  | 'rowSelected'
  | 'selectionChanged';

export interface SortModelItem {
  colId: string;
  sort : 'asc' | 'desc';
}

export interface LogContext {
  sessionId    : string;
  userId       : string | null;   // opaque hash — never raw PII
  tenantId     : string | null;
  route        : string;
  componentName: string;
  gridId       : string | null;
}

export interface ApiLog {
  requestId  : string;
  method     : string;
  url        : string;            // pathname + scrubbed params only
  status     : number | null;     // null = network error
  reqSizeB   : number;
  resSizeB   : number;
  durationMs : number;
}

export interface PerfMetric {
  name       : string;
  durationMs : number;
  entryType  : string;
  detail     : Record<string, unknown> | null;
}

export interface GridEvent {
  eventType  : GridEventType;
  rowCount   : number | null;
  columnId   : string | null;
  filterModel: string | null;     // JSON.stringify of filter model
  sortModel  : SortModelItem[] | null;
}

export interface LogEntry {
  id        : string;             // nanoid(12)
  timestamp : string;             // ISO-8601 UTC
  level     : LogLevel;
  category  : LogCategory;
  message   : string;
  data      : Record<string, unknown> | null;
  context   : LogContext;
  error?: {
    name   : string;
    message: string;
    stack  : string;              // trimmed to 4 KB
    cause  : string | null;
  };
  perf?  : PerfMetric;
  api?   : ApiLog;
  grid?  : GridEvent;
  _meta  : {
    sdkVersion: string;
    batchId   : string;
    seqNo     : number;
    dropped   : boolean;
  };
}

export interface LogBatch {
  batchId     : string;
  clientTime  : string;
  appVersion  : string;
  flushReason : string;
  entries     : LogEntry[];
}
