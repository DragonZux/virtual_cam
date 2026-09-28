/** Tải blob về máy bằng thẻ <a download> tạm. */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export type CsvCell = string | number | null | undefined;

/**
 * Xuất CSV mở được bằng Excel (UTF-8 BOM, dấu ; để Excel tiếng Việt tách cột đúng).
 * rows: mảng các hàng, mỗi hàng là mảng ô theo thứ tự headers.
 */
export const downloadCsv = (filename: string, headers: string[], rows: CsvCell[][]) => {
  const esc = (v: CsvCell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(esc).join(";"));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
};
