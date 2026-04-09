# Common Rules

## Git Workflow
- Never use `--no-verify` flag on git commits
- Commit messages: imperative mood, under 72 characters
- Each commit: single logical change
- Never commit .env.local or secrets

## Security
- Never hardcode API keys or secrets in source code
- All secrets in .env.local (in .gitignore)
- Validate all external API responses before use
- Sanitize user input before API calls

## Error Handling
- Every async operation needs try/catch
- Never silently swallow errors — always log
- API failures return graceful fallbacks, not crashes
- User-facing errors: helpful messages, not stack traces

## Code Quality
- No `any` types
- No unused imports or variables
- No console.log in production (use proper logging)
- No commented-out code in commits
