import { createFormHookContexts } from '@tanstack/react-form'

// Split from use-app-form.ts so the bound fields can read their field without an import cycle.
// Pure: importing a feature index must not pull the form code into every bundle.
export const { fieldContext, formContext, useFieldContext } = /* @__PURE__ */ createFormHookContexts()
