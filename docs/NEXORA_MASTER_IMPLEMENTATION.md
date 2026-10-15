# Nexora Business Suite — implementação mestre

## Estado auditado (out 2026)
| Área | Estado |
|---|---|
| Base: contas, organizações, papéis, convites, auditoria | Validada (RLS + RPC) |
| Finance: contas, movimentos, faturação FT/FR/PF/NC, pagamentos | Validada (RPCs transacionais) |
| Sales: clientes | Parcial; migration de oportunidades/tickets preparada, ainda sem validação/aplicação confirmada |
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
- Estado/suspensão da organização só alterável pela administração Nexora; migration 0006 fecha o bypass de `auth.uid() IS NULL`, ainda pendente de execução/verificação na base.
- Removida referência a tabela placeholder em `create_organization` (já corrigida na 0001).
- Trial: dados reais confirmam 14 dias em todos os planos.

## Regras de integração (próximas fases)
Consumo de material em projeto = movimento de stock + custo de projeto, nunca despesa adicional; todas as operações com chave de idempotência.


## Estado de validação do branch (15/10/2026)
- A execução CI anterior confirmou instalação e testes unitários, mas TypeScript e build falharam porque a página inicial ainda importava `MODULES`; a página inicial foi alinhada com `PLATFORMS` no branch.
- O lint anterior encontrou deriva de formatação Prettier espalhada no código legado e um erro `prefer-const`; o erro direto foi corrigido e a formatação foi separada do lint de correção funcional. É obrigatório reexecutar CI antes de considerar esta etapa aprovada.
- As migrations 0005 e 0006 são alterações de código, não prova de que foram aplicadas à base ativa. Não aplicar automaticamente sem ambiente de teste/backup e validação SQL.
- Não foi confirmado acesso à base ativa, credenciais de teste ou sincronização GitHub→Lovable. Essas verificações permanecem abertas.
