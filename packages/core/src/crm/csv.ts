/**
 * Planilha CSV (separador ";" e BOM, para abrir certo no Excel em português).
 * Célula que começa com =, +, -, @ ou tabulação ganha um apóstrofo na frente, para a planilha
 * não executar como fórmula (injeção de fórmula).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
