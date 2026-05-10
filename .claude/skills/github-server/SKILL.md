---
name: github-server
description: Use when the task involves the github service — any operation that would call an MCP tool from the github server. Indexes the 44 available tools under `./servers/github/` and surfaces server-level gotchas before the agent starts `ls`-ing wrappers blindly. Read `references/tools.md` for the full catalog with descriptions and behavior hints.
---

# github server

Wrapper files live in `./servers/github/`. Import with:

```typescript
import * as github from './servers/github';
```

For the full list of tools, their descriptions, and behavior hints (read-only / destructive / idempotent), read `references/tools.md`. That file is regenerated from the live MCP schema on every `npm run generate-wrappers`, so it's always in sync.

## Workhorses

<!-- Curate by hand: the 5-10 tools you actually reach for most often.
     Example:
     - `list_issues` — paginated issue fetch; pair with code-side filtering
     - `get_file_contents` — single-file read; preferred over cloning
-->

## Gotchas

<!-- Add server-specific corrections here as you encounter them. Examples:
     - Default page size is 30; pass perPage=100 for fewer round trips
     - Tool X requires auth scope Y; without it the call returns 200 with empty data
-->

## Related skills

<!-- Cross-reference workflow skills that build on this server. Example:
     - `github-issue-analyzer` — pre-built workflow for analyzing repo issues
-->
