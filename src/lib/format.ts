const kz = new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatKz(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `${kz.format(Number.isFinite(n) ? n : 0)} Kz`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? value + "T00:00:00" : value);
  return new Intl.DateTimeFormat("pt-AO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Luanda" }).format(d);
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Ocorreu um erro inesperado.";
}

/** Line totals used for invoice previews; must match the database formula. */
export function lineTotals(quantity: number, unitPrice: number, taxRate: number) {
  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const tax = Math.round(quantity * unitPrice * taxRate) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário", admin: "Administrador", director: "Diretor", manager: "Gestor",
  supervisor: "Supervisor", operator: "Operador", employee: "Colaborador", accountant: "Contabilista",
  hr: "Recursos Humanos", sales: "Comercial", support: "Suporte", auditor: "Leitor/Auditor",
};

export const SUB_STATUS: Record<string, string> = {
  trial: "Período de teste", active: "Ativa", past_due: "Pagamento em atraso", suspended: "Suspensa",
  cancelled: "Cancelada", expired: "Expirada", pending: "Pendente",
};

export const INVOICE_STATUS: Record<string, string> = { draft: "Rascunho", issued: "Emitido", paid: "Pago", cancelled: "Anulado" };
export const DOC_TYPES: Record<string, string> = { FT: "Fatura", FR: "Fatura-recibo", PF: "Fatura pró-forma", NC: "Nota de crédito" };
