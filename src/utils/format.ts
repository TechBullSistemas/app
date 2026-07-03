export function fmtQty(v: number) {
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('pt-BR');
  } catch {
    return v;
  }
}

export function todayBr(): string {
  return new Date().toLocaleDateString('pt-BR');
}

/** Máscara dd/mm/aaaa enquanto o usuário digita. */
export function maskDateBR(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length >= 5) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

export function dateToBr(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

export function brToDate(br: string): Date | null {
  const iso = parseBrDateToIso(br);
  if (!iso) return null;
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseBrDateToIso(br: string): string | null {
  const m = br.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return iso;
}
