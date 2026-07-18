# Full-stack Type Safety Workflow

This repository treats the backend OpenAPI schema as the API contract source of truth.

## Contract Artifacts

- Backend schema artifact: `apps/api/openapi.json`
- Generated frontend schemas: `apps/web/src/lib/api/generated/api.schemas.ts`
- Generated type barrel: `apps/web/src/lib/api/generated/index.ts`
- Generated API clients and validators: `apps/web/src/lib/api/generated/`

## Commands

Generate the backend schema and frontend artifacts from the repository root:

```bash
bun run generate:contracts
```

Generate only the backend OpenAPI schema from the repository root:

```bash
bun run --cwd apps/api generate:openapi
```

Generate only the frontend TypeScript artifacts from the repository root:

```bash
bun run --cwd apps/web generate:api-types
```

Regenerate every artifact and fail if the result differs from the committed files:

```bash
bun run check:contracts
```

## Contract Rules

- Backend DTOs are the source of truth for request and response shapes.
- Frontend transport types should come from generated OpenAPI artifacts, not handwritten interfaces.
- UI-only state and form validation can still use local types and Valibot schemas.
- If a backend field is nullable, normalize it at the frontend boundary instead of weakening the
  generated contract.
- If a frontend UI model intentionally differs from the transport model, add an explicit mapping
  function in the service layer.

## Expected Change Flow

1. Update or add backend request/response DTOs.
2. Update routers to use explicit request and response models.
3. Run `bun run generate:contracts`.
4. Update frontend service-layer mappings if the contract changed.
5. Run `bun run check:contracts` and `bun run vp check`.

## CI Enforcement

The `Contract Sync` workflow runs `bun run check:contracts`. The command regenerates the contract
and fails when `apps/api/openapi.json` or any file under `apps/web/src/lib/api/generated/` differs
from the committed version.
