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


## Estado de validação do branch (17/10/2026)
- CI mais recente consultada: testes unitários, TypeScript e build passaram; o lint falhou com erros Prettier herdados (a configuração de override foi corrigida num commit posterior, ainda sem resultado CI confirmado).
- A página inicial está alinhada com `PLATFORMS`; os testes cobrem os dez IDs e os estados do catálogo.
- As migrations 0005 e 0006 são alterações de código, não prova de que foram aplicadas à base ativa. Não aplicar automaticamente sem ambiente de teste/backup e validação SQL.
- A branch contém 16 commits à frente de `main` e 0 atrás. A `main` continua no SHA `636aa072f4eb387509eee79d213b68dfa39678ef`.
- O projeto Lovable consultado continua a indicar esse SHA antigo; sincronização GitHub→Lovable não está confirmada. Não foi aplicado qualquer SQL à base ativa nem publicada a aplicação.


## Correções de continuidade (22/10/2026)
- Pipeline comercial: a tabela `sales_opportunities` estava ausente na base ativa, embora a página `/app/vendas` a consultasse. Foi criada com RLS e quatro políticas restritivas usando os helpers `private.nexora_*`; ver migration `0037_nexora_restore_sales_opportunities_pipeline.sql`.
- Plataformas departamentais: a seleção inicial não acompanhava mudanças de `?platform=` enquanto a rota permanecia montada. O estado ativo agora sincroniza com o parâmetro da rota.
- A tabela de oportunidades foi confirmada com 13 colunas, RLS ativo e quatro políticas. Falta teste E2E autenticado com utilizadores reais antes de declarar o pipeline validado integralmente.
