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
    status: "planned",
    includes: ["Recursos Humanos", "Férias, ausências, assiduidade e escalas", "Recrutamento, desempenho e formação"],
  },
  {
    id: "supply",
    name: "Nexora Supply",
    description: "Inventário, armazéns, compras, fornecedores e movimentações de stock.",
    status: "planned",
    includes: ["Gestão de stocks e armazéns", "Compras e fornecedores"],
  },
  {
    id: "projects-services",
    name: "Nexora Projects & Services",
    description: "Projetos, tarefas, equipas, agendamentos e ordens de trabalho.",
    status: "planned",
    includes: ["Gestão de projetos e tarefas", "Serviços, agendamentos e ordens de trabalho"],
  },
  {
    id: "operations-logistics",
    name: "Nexora Operations & Logistics",
    description: "Operações, entregas, frota, ativos, manutenção e estrutura organizacional.",
    status: "planned",
    includes: ["Logística, entregas e frota", "Ativos, equipamentos e manutenção", "Filiais, departamentos e centros de custo"],
  },
  {
    id: "manufacturing",
    name: "Nexora Manufacturing",
    description: "Planeamento de produção, ordens de fabrico, consumos e qualidade.",
    status: "planned",
    includes: ["Produção e ordens de fabrico"],
  },
  {
    id: "education",
    name: "Nexora Education",
    description: "Gestão de escolas, alunos, encarregados, turmas, avaliações e propinas.",
    status: "planned",
    includes: ["Gestão escolar e colégios"],
  },
  {
    id: "hospitality-pos",
    name: "Nexora Hospitality & POS",
    description: "Restaurantes, mesas, pedidos, ponto de venda e, como extensão, alojamento.",
    status: "planned",
    includes: ["Restaurantes, mesas e POS", "Alojamento, reservas e propriedades"],
  },
  {
    id: "legal-documents",
    name: "Nexora Legal & Documents",
    description: "Documentos, contratos, aprovações, versões e prazos.",
    status: "planned",
    includes: ["Documentos, contratos e assinaturas"],
  },
];

export const PLATFORM_STATUS_LABEL: Record<PlatformStatus, string> = {
  live: "Disponível",
  partial: "Parcialmente disponível",
  planned: "Planeada",
};
