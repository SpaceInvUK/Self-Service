// Minimal Buffer stand-in so server/workbook.mjs runs in the browser.
globalThis.Buffer ??= {
  from: (x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x),
};
