export type PlatformStatus = "live" | "partial" | "planned";

export interface SuitePlatform {
  id: string;
  name: string;
  description: string;
  status: PlatformStatus;
  to?: string;
  includes: string[];
}

/**
 * Canonical catalogue for Nexora Business Suite.
 * A platform is only marked live when its primary route has implemented functionality.
 * Planned items are displayed transparently and are not presented as operational.
 */
export const PLATFORMS: SuitePlatform[] = [
  {
    id: "finance",
    name: "Nexora Finance",
    description: "Tesouraria, movimentos financeiros, faturação e documentos comerciais.",
    status: "live",
    to: "/app/financas",
    includes: ["Finanças e tesouraria", "Faturação e documentos comerciais", "Contabilidade e relatórios financeiros", "Despesas, adiantamentos e reembolsos"],
  },
  {
    id: "sales-cx",
    name: "Nexora Sales & Customer Experience",
    description: "Clientes, CRM, oportunidades comerciais, campanhas e atendimento.",
    status: "partial",
    to: "/app/vendas",
    includes: ["Vendas, clientes e CRM", "Suporte, tickets e atendimento", "Marketing e campanhas", "Comércio eletrónico e catálogo"],
  },
  {
    id: "people",
    name: "Nexora People",
    description: "Ciclo de vida dos colaboradores, assiduidade e gestão de pessoas.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Registo de colaboradores (base)", "Férias, ausências, assiduidade e escalas (por implementar)", "Férias, ausências, assiduidade e escalas", "Recrutamento, desempenho e formação"],
  },
  {
    id: "supply",
    name: "Nexora Supply",
    description: "Inventário, armazéns, compras, fornecedores e movimentações de stock.",
    status: "partial",
    to: "/app/inventario",
    includes: ["Catálogo de artigos e níveis de stock", "Movimentos de entrada, saída e ajuste", "Compras e fornecedores (por implementar)"],
  },
  {
    id: "projects-services",
    name: "Nexora Projects & Services",
    description: "Projetos, tarefas, equipas, agendamentos e ordens de trabalho.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Registo base de projetos e ordens de trabalho", "Tarefas avançadas e agendamento (por implementar)"],
  },
  {
    id: "operations-logistics",
    name: "Nexora Operations & Logistics",
    description: "Operações, entregas, frota, ativos, manutenção e estrutura organizacional.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Ordens de trabalho operacionais (base)", "Frota, ativos e logística avançada (por implementar)"],
  },
  {
    id: "manufacturing",
    name: "Nexora Manufacturing",
    description: "Planeamento de produção, ordens de fabrico, consumos e qualidade.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Registo base de ordens de produção", "Materiais, BOM e controlo de qualidade (por implementar)"],
  },
  {
    id: "education",
    name: "Nexora Education",
    description: "Gestão de escolas, alunos, encarregados, turmas, avaliações e propinas.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Registo base de alunos", "Turmas, avaliações, presenças e propinas (por implementar)"],
  },
  {
    id: "hospitality-pos",
    name: "Nexora Hospitality & POS",
    description: "Restaurantes, mesas, pedidos, ponto de venda e, como extensão, alojamento.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Registo base de pedidos POS", "Linhas de pedido, pagamentos e reservas (por implementar)"],
  },
  {
    id: "legal-documents",
    name: "Nexora Legal & Documents",
    description: "Documentos, contratos, aprovações, versões e prazos.",
    status: "partial",
    to: "/app/departamentos",
    includes: ["Registo base de documentos jurídicos", "Versionamento, aprovações e assinatura digital (por implementar)"],
  },
];

export const PLATFORM_STATUS_LABEL: Record<PlatformStatus, string> = {
  live: "Disponível",
  partial: "Parcialmente disponível",
  planned: "Planeada",
};
