# TypeScript Rules

## Types
- Prefer `type` over `interface`
- Never use `enum` — use string literal unions
- Never use `any` — use `unknown` then narrow with type guards
- Export all types from src/lib/types.ts
- Use `readonly` for immutable properties

## Functions
- Single responsibility, small functions
- Pure functions preferred (same input, same output)
- Always type parameters and return values explicitly
- Use async/await, never raw .then() chains

## Immutability
- Create new objects: `{ ...obj, key: newValue }`
- Use map/filter/reduce — never mutate arrays
- `const` by default, `let` only when needed

## File Organization
- One concern per file
- 200-400 lines typical, 800 max
- Imports: external first, internal second, relative third

## Error Handling
- Use typed results: `type ApiResult<T> = { success: true; data: T } | { success: false; error: string }`
- Never throw in library code — return error types
- Only API route handlers use try/catch for HTTP errors

## Next.js
- Server components by default
- "use client" only for hooks/events/browser APIs
- Route Handlers (app/api/) for backend logic
- process.env on server only, NEXT_PUBLIC_ for client
