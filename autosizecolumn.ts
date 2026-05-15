private calcColumnWidth(field: string, data: any[]): number {
  const HEADER_CHAR_WIDTH = 7.5;  // 11px bold — bold chars are ~10-15% wider
  const CELL_CHAR_WIDTH = 6.5;    // 11px normal weight
  const HEADER_PADDING = 32;      // space for sort/filter/menu icons
  const CELL_PADDING = 16;
  const MIN = 80;
  const MAX = 350;

  // Bold header width
  const headerWidth = field.length * HEADER_CHAR_WIDTH + HEADER_PADDING;

  // Sample first 50 rows only
  const sampleSize = Math.min(data.length, 50);
  const sample = data.slice(0, sampleSize);

  const maxCellWidth = sample.reduce((max, row) => {
    const cellLen = String(row[field] ?? '').length;
    return Math.max(max, cellLen * CELL_CHAR_WIDTH + CELL_PADDING);
  }, 0);

  const computed = Math.max(headerWidth, maxCellWidth);
  return Math.min(Math.max(computed, MIN), MAX);
}

//new

private canvasCtx: CanvasRenderingContext2D | null = null;

private calcColumnWidth(field: string): number {
  if (!this.canvasCtx) {
    this.canvasCtx = document.createElement('canvas').getContext('2d')!;
    this.canvasCtx.font = 'bold 11px Inter';
  }
  return Math.ceil(this.canvasCtx.measureText(field).width) + 32;
}

buildColumnDefs(jsonResponse: any[]): ColDef[] {
  if (!jsonResponse?.length) return [];

  return Object.keys(jsonResponse[0]).map(key => ({
    field: key,
    headerName: key,
    width: this.calcColumnWidth(key),
    resizable: true,
  }));
}


