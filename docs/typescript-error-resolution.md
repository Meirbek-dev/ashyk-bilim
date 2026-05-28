You are performing a full TypeScript stabilization and type-system hardening pass on this codebase.

Current status:

* `bun check-types`
* `tsgo --noEmit`

Results:

* 708 TypeScript errors
* 196 files affected

Your task is NOT to silence errors quickly.
Your task is to systematically improve the type architecture, runtime safety, and maintainability of the codebase while eliminating all TypeScript errors.

Critical constraints:

* Do NOT use `any` unless there is absolutely no alternative and the boundary is explicitly documented.
* Do NOT use blanket casts like:

  * `as any`
  * `as unknown as`
  * `// @ts-ignore`
  * `// @ts-expect-error`
  * non-null assertions (`!`)
  * broad unsafe generic assertions
* Do NOT weaken tsconfig strictness.
* Do NOT disable ESLint or TS rules.
* Do NOT introduce “temporary” hacks.
* Do NOT change runtime behavior unless required to fix a real bug.
* Prefer inference, discriminated unions, generics, schema-driven typing, and proper narrowing.
* Prefer architectural fixes over local patches.
* Preserve idiomatic Next.js 16 + React 19 patterns.
* Preserve server/client component boundaries.
* Preserve existing domain models where possible.

Execution strategy:

1. First classify ALL errors into categories:

   * nullability
   * incorrect generics
   * invalid async usage
   * React prop mismatches
   * server/client boundary violations
   * API typing issues
   * unsafe unions
   * missing runtime guards
   * form typing issues
   * TanStack Query typing issues
   * schema drift
   * DTO/domain mismatch
   * test typing issues
   * Playwright/Vitest typing problems
   * editor/Tiptap extension typing
   * config/env typing
   * inferred `never`
   * inferred `unknown`
   * implicit `any`
   * invalid overload resolution
   * etc.

2. Identify root causes before editing.
   A small number of bad abstractions are likely generating hundreds of downstream errors.
   Fix root abstractions first.

3. Prioritize fixes in this order:

   1. shared types
   2. API/client contracts
   3. schema validation
   4. hooks/utilities
   5. domain services
   6. React component contracts
   7. tests
   8. edge-case leaf components

4. Before changing a file:

   * understand its role in the architecture
   * trace inbound/outbound types
   * identify whether the type model or implementation is wrong
   * prefer making illegal states unrepresentable

5. For API/data boundaries:

   * validate unknown data properly
   * use Zod or existing schema systems
   * infer types from schemas instead of duplicating interfaces
   * eliminate divergence between DTOs and domain entities

6. For React components:

   * remove invalid optionality
   * correctly type children/render props
   * avoid prop drilling type erosion
   * preserve memoization compatibility
   * ensure server/client compatibility
   * avoid widening literals accidentally

7. For hooks:

   * ensure generics propagate correctly
   * eliminate unstable nullable states
   * correctly model loading/error/success states
   * avoid impossible state combinations

8. For TanStack Query:

   * strongly type:

     * query keys
     * query functions
     * mutation payloads
     * optimistic updates
     * invalidation helpers
   * remove implicit `unknown`

9. For forms:

   * infer types from validation schemas
   * ensure defaultValues align with schema shape
   * eliminate partial-state drift

10. For tests:

* fix mocks correctly
* avoid fake casting
* properly type fixtures and factories
* ensure Playwright/Vitest utilities share real app types

11. While fixing:

* aggressively deduplicate duplicated types
* consolidate parallel interfaces
* remove dead type layers
* eliminate obsolete compatibility code
* simplify over-engineered generics
* improve naming consistency

12. After every major batch:
    Run:

* `bun check-types`
* `tsgo --noEmit`
* relevant tests

13. Do not mass-edit blindly.
    Every fix must improve correctness.

14. If a type error reveals a runtime bug, fix the runtime bug properly instead of masking it.

15. Produce a final result with:

* zero TypeScript errors
* stricter type guarantees
* fewer unsafe casts
* improved inference quality
* reduced type duplication
* cleaner architectural boundaries

Important:
A clean typecheck is NOT the success criteria by itself.
The success criteria is a cleaner, safer, more coherent type system across the application.

When choosing between:

* “fast fix”
  vs
* “correct abstraction”

always choose the correct abstraction.
