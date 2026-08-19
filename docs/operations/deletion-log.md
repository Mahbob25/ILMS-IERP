# Code Deletion Log

## [2026-07-05] Refactor & Dead Code Cleanup

### Unused Dependencies Removed (Frontend)
- `@reduxjs/toolkit@^2.12.0` - Never imported anywhere (~23 KB)
- `clsx@^2.1.1` - Never imported anywhere (~3 KB)
- `tailwind-merge@^2.3.0` - Never imported anywhere (~2 KB)
- `@types/react-dom@^18.3.0` - Redundant (React ships its own types)
- `@types/recharts@^2.0.1` - Redundant (recharts ships built-in types)

### Missing Dependency Added (Frontend)
- `recharts@^2.12.0` - Used in `ManagerDashboard.tsx` and `revenue/page.tsx` but was missing from dependencies

### Unused Python Import Removed
- `apps/erp/backend/app/modules/academic/service.py` - Removed unused import `contains_eager` from sqlalchemy.orm (never referenced in file)

### Debug/Artifact Files Deleted
- `cookie.txt` - Debug cookie file (gitignored)
- `backend.log` - Server stdout log
- `apps/erp/backend/backend_err.log` - Server stderr log
- `apps/erp/backend/backend_out.log` - Server stdout log
- `apps/erp/frontend/next_error.txt` - Next.js build error output
- `apps/erp/frontend/next_output.txt` - Next.js build output

### Tracked Debug Files Removed (git rm)
- `cookies.txt` - Debug cookie dump (tracked in git)
- `cookies2.txt` - Debug cookie dump (tracked in git)
- `cookies3.txt` - Debug cookie dump (tracked in git)
- `cookies4.txt` - Debug cookie dump (tracked in git)
- `cookies5.txt` - Debug cookie dump (tracked in git)

### `.gitignore` Updated
- Added patterns for: `next_error.txt`, `next_output.txt`, `.npm-cache/`, `cookies*.txt`
- Ensures similar artifacts are not committed in the future

### Impact
- Files deleted: 11
- Dependencies removed: 5
- Dependencies added: 1
- Lines of code removed: ~35
- Bundle size reduction: ~28 KB

### Testing
- TypeScript compilation (`npx tsc --noEmit`): PASS
- No test files were modified, so existing test coverage is unaffected
- Recharts dependency added matches existing usage in codebase
