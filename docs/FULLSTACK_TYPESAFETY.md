# Fullstack Typesafety Workflow

This repository treats the backend OpenAPI schema as the API contract source of truth.

## Contract Artifacts

- Backend schema artifact: `apps/api/openapi.json`
- Generated frontend types: `apps/web/lib/api/generated/schema.ts`
- Generated type barrel: `apps/web/lib/api/generated/index.ts`

## Commands

Generate both backend and frontend contract artifacts from the repository root:

```bash
bun run generate:contracts
```

Generate only the backend OpenAPI schema:

```bash
cd apps/api
bun run generate:openapi
```

Generate only the frontend TypeScript contract types:

```bash
cd apps/web
bun run generate:api-types
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
5. Run frontend typecheck.

## CI Enforcement

The `Contract Sync` workflow regenerates the contract artifacts and fails if `apps/api/openapi.json`
or `apps/web/lib/api/generated/schema.ts` are out of date.
