# Lessons Learned

## How To Use This File
After ANY correction from the user:
1. Document what went wrong
2. Write the rule to prevent it
3. If it could recur, also add the rule to CLAUDE.md

Review this file at the start of every session.

## Rules
(None yet — this file grows as the project progresses)

## Log
(Add entries in reverse chronological order)

- Search flows must separate live input from loaded report state. If the user edits the query, clear or invalidate any in-flight analysis so the UI cannot keep showing a previous company’s report for a new query.
