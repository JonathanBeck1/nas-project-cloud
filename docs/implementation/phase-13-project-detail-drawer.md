# Phase 13: Project Detail Drawer

Date: 2026-05-30

This phase closes a project-workspace usability gap. Project pages already
showed files, uploads, bulk ZIP export, and archive actions, but selecting a
file only highlighted the grid item. The same file-management actions available
from the main inbox now work directly inside a project.

## Shipped

- Selecting a project file opens the detail drawer beside the project grid.
- The drawer exposes direct download, archive, rename, project assignment, and
  tag assignment actions.
- Archived files are removed from the current project grid and selection state.
- Renamed files update in place without a page refresh.
- Files moved out of the current project are removed from the current project
  view.

## Verification

- `npm test -- tests/components/ProjectWorkspace.test.tsx`
