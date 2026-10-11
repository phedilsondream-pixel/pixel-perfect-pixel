export type ModuleStatus = "live" | "planned";
export interface SuiteModule { n: number; name: string; status: ModuleStatus; to?: string }

export const MODULES: SuiteModule[] = [
  { n: 1, name: "Finanças e tesouraria", status: "live", to: "/app/financas" },
  { n: 2, name: "Faturação e documentos comerciais", status: "live", to: "/app/faturacao" },
  { n: 3, name: "Contabilidade e relatórios financeiros", status: "planned" },
  { n: 4, name: "Gestão de stocks e armazéns", status: "planned" },
  { n: 5, name: "Vendas, clientes e CRM", status: "live", to: "/app/clientes" },
  { n: 6, name: "Compras e fornecedores", status: "planned" },
  { n: 7, name: "Recursos Humanos", status: "planned" },
  { n: 8, name: "Férias, ausências, assiduidade e escalas", status: "planned" },
  { n: 9, name: "Gestão de projetos e tarefas", status: "planned" },
  { n: 10, name: "Documentos, contratos e assinaturas", status: "planned" },
  { n: 11, name: "Gestão escolar e colégios", status: "planned" },
  { n: 12, name: "Suporte, tickets e atendimento", status: "planned" },
  { n: 13, name: "Marketing e campanhas", status: "planned" },
  { n: 14, name: "Logística, entregas e frota", status: "planned" },
  { n: 15, name: "Ativos, equipamentos e manutenção", status: "planned" },
  { n: 16, name: "Filiais, departamentos e centros de custo", status: "planned" },
  { n: 17, name: "Despesas, adiantamentos e reembolsos", status: "planned" },
  { n: 18, name: "Restaurantes, mesas e POS", status: "planned" },
  { n: 19, name: "Produção e ordens de fabrico", status: "planned" },
  { n: 20, name: "Serviços, agendamentos e ordens de trabalho", status: "planned" },
  { n: 21, name: "Alojamento, reservas e propriedades", status: "planned" },
  { n: 22, name: "Comércio eletrónico e catálogo", status: "planned" },
  { n: 23, name: "Relatórios e indicadores", status: "planned" },
  { n: 24, name: "Administração da plataforma e assinaturas", status: "live", to: "/admin" },
];
