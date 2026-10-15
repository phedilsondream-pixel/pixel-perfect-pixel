# Nexora Business Suite — implementação mestre

## Estado auditado (out 2026)
| Área | Estado |
|---|---|
| Base: contas, organizações, papéis, convites, auditoria | Validada (RLS + RPC) |
| Finance: contas, movimentos, faturação FT/FR/PF/NC, pagamentos | Validada (RPCs transacionais) |
| Sales: clientes | Parcial (sem CRM/oportunidades/tickets) |
| Planos e limites | Validada no servidor (triggers); pagamento online bloqueado (plano Lovable gratuito) |
| Email de convites | Bloqueado: domínio de email não configurado |
| Restantes plataformas | Ausentes |

## Mapa 24 módulos → 10 plataformas
- Finance: 1, 2, 3, 17 · Sales & CX: 5, 12, 13 · People: 7, 8 · Supply: 4, 6
- Projects & Services: 9, 20 · Operations & Logistics: 14, 15 · Manufacturing: 19
- Education: 11 · Hospitality & POS: 18 · Legal & Documents: 10
- Transversal: 16 (estrutura organizacional), 23 (relatórios), 24 (administração)
- Extensões documentadas: 21 Alojamento/reservas (vertical opcional ligada a Hospitality), 22 E-commerce (extensão de Sales + Supply)

## Correções de segurança aplicadas
- `accept_my_invitations` só ignora o erro de limite do plano (SQLSTATE NX001); outros erros propagam.
- Referência de pagamento única por organização (índice) — idempotência sob concorrência.
- Fatura só aceita cliente da mesma organização (trigger).
- Estado/suspensão da organização só alterável pela administração Nexora.
- Removida referência a tabela placeholder em `create_organization` (já corrigida na 0001).
- Trial: dados reais confirmam 14 dias em todos os planos.

## Regras de integração (próximas fases)
Consumo de material em projeto = movimento de stock + custo de projeto, nunca despesa adicional; todas as operações com chave de idempotência.
