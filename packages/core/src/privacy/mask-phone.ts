/**
 * Mascara um telefone para aparecer em logs sem expor o número inteiro.
 * Mantém o código do país, o DDD e os 4 últimos dígitos (SEGURANCA.md, seção 9).
 *
 * Exemplo: "5515991232709" -> "+55 15 9****-2709"
 */
export function maskPhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');

  if (digits.length < 8) {
    return '****';
  }

  const last4 = digits.slice(-4);

  // Formato brasileiro com país: 55 + DDD (2) + número (8 ou 9 dígitos).
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    const hidden = '*'.repeat(local.length - 5);
    return `+55 ${ddd} ${local[0]}${hidden}-${last4}`;
  }

  return `${'*'.repeat(digits.length - 4)}${last4}`;
}
