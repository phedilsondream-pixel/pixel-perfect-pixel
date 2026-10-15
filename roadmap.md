# Nexora roadmap

## Foundation and security
- [x] Base: accounts, organizations, memberships, invitations and audit
- [x] Finance foundation: accounts, transactions, invoices and payment registration
- [x] Brand Kit applied
- [x] Security hardening for invitation limits, invoice/customer organization boundaries and transaction references
- [x] Document the mapping from the legacy 24-module catalogue to 10 integrated platforms
- [x] Replace the legacy 24-module screen with the 10-platform catalogue and transparent implementation statuses

## Implementation status
- [x] Nexora Finance: existing finance and invoicing routes
- [ ] Nexora Sales & Customer Experience: customer directory exists; CRM, opportunities, campaigns and tickets remain
- [ ] Nexora People: HR, recruitment, leave, attendance, schedules, performance and training
- [ ] Nexora Supply: stock, warehouses, purchases and suppliers
- [ ] Nexora Projects & Services: projects, tasks, scheduling and work orders
- [ ] Nexora Operations & Logistics: deliveries, fleet, assets, maintenance and organizational structure
- [ ] Nexora Manufacturing: production orders, bills of materials, consumption, waste and quality
- [ ] Nexora Education: schools, students, guardians, classes, attendance, grades and fees
- [ ] Nexora Hospitality & POS: restaurants, tables, orders and point of sale
- [ ] Nexora Legal & Documents: documents, contracts, versions, approvals and deadlines
- [ ] Cross-cutting: reports, notifications, automation, search, import/export and configuration

## Validation and release
- [ ] Run tests, lint, TypeScript checks and production build in a configured environment
- [ ] Validate migrations against a clean database and inspect security policies/RLS
- [ ] Restore stricter TypeScript checks after resolving existing errors
- [ ] Verify internal pages using an authorized test account
- [ ] Configure email domain before enabling invitation emails
- [ ] Configure and test a supported payment provider before claiming online payments are active
- [ ] Verify GitHub-to-Lovable sync separately; GitHub is the source of truth for code changes
