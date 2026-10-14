<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Multi-tenant data: every business table carries organization_id and RLS uses has_org_role/is_org_member security-definer helpers — isolation must hold in the database, not the UI.
- Issued invoices and finance transactions are changed only through SQL RPCs (issue_invoice, register_invoice_payment, cancel_invoice) — keeps numbering sequential and history immutable.
- Plan limits are enforced by database triggers reading the plans table — prices/limits stay editable without code.
- Signed-in pages live under src/routes/_authenticated (client-only gate) and render inside AppShell.
- Brand colors live as tokens in src/styles.css; the "copper" token name is the brand highlight (currently Nexora blue).
