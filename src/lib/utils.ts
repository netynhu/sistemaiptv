export function fmtMoeda(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addMeses(dataISO: string, meses: number): string {
  const d = new Date(dataISO + 'T12:00:00');
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function diasAte(dataISO: string | null): number | null {
  if (!dataISO) return null;
  const hoje = new Date(hojeISO() + 'T12:00:00');
  const alvo = new Date(dataISO.slice(0, 10) + 'T12:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

// Normaliza telefone para o formato aceito pela Uazapi (DDI 55 + DDD + número)
export function normalizarTelefone(tel: string): string {
  let d = (tel || '').replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 11 && !d.startsWith('55')) d = '55' + d;
  return d;
}

export function fmtTelefone(tel: string | null): string {
  if (!tel) return '—';
  const d = tel.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

export function mesAtualISO(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export function nomeMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[m - 1]} de ${y}`;
}

// Substitui {placeholders} em templates de mensagem
export function aplicarTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}
