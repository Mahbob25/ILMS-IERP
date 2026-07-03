# Graph Report - .  (2026-06-20)

## Corpus Check
- Corpus is ~29,153 words - fits in a single context window. You may not need a graph.

## Summary
- 225 nodes · 341 edges · 20 communities (15 shown, 5 thin omitted)
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 90 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Database Base Models|Database Base Models]]
- [[_COMMUNITY_Graphify Skill System|Graphify Skill System]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Identity Auth Router|Identity Auth Router]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Auth Context Provider|Auth Context Provider]]
- [[_COMMUNITY_Audit Log Service|Audit Log Service]]
- [[_COMMUNITY_Auth Dependencies|Auth Dependencies]]
- [[_COMMUNITY_Alembic Migrations|Alembic Migrations]]
- [[_COMMUNITY_App Configuration|App Configuration]]
- [[_COMMUNITY_Health Check Endpoint|Health Check Endpoint]]
- [[_COMMUNITY_Database Session|Database Session]]
- [[_COMMUNITY_Next.js Middleware|Next.js Middleware]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]

## God Nodes (most connected - your core abstractions)
1. `Graphify` - 18 edges
2. `Lean MVP v1.6` - 18 edges
3. `compilerOptions` - 15 edges
4. `FastAPI Backend` - 15 edges
5. `login()` - 14 edges
6. `refresh_token()` - 14 edges
7. `Response` - 13 edges
8. `AsyncSession` - 13 edges
9. `RoleChecker` - 12 edges
10. `Role` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Node ID Format` --semantically_similar_to--> `Isolate and Resume`  [INFERRED] [semantically similar]
  .agents/skills/graphify/references/extraction-spec.md → docs/Plan-v1.6.md
- `FastAPI Backend` --references--> `Alembic`  [INFERRED]
  docker-compose.yml → backend/requirements.txt
- `FastAPI Backend` --references--> `Asyncpg`  [INFERRED]
  docker-compose.yml → backend/requirements.txt
- `FastAPI Backend` --references--> `Passlib (bcrypt)`  [INFERRED]
  docker-compose.yml → backend/requirements.txt
- `FastAPI Backend` --references--> `Psutil`  [INFERRED]
  docker-compose.yml → backend/requirements.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **LIMS Lean MVP Architecture** — lms_docker_compose_caddy, lms_docker_compose_frontend, lms_docker_compose_backend, lms_docker_compose_database, lms_docker_compose_lims_internal_network [EXTRACTED 1.00]
- **Graphify Extraction Pipeline** — graphify_skill_extraction_pipeline, graphify_skill_ast_extraction, graphify_skill_semantic_extraction, graphify_skill_community_detection, graphify_skill_god_nodes, graphify_skill_graph_report [EXTRACTED 1.00]
- **LIMS Offline Resilience Mechanisms** — docs_plan_v1_6_offline_resilience, docs_plan_v1_6_isolate_and_resume, docs_plan_v1_6_rag_pgvector, docs_plan_v1_6_circuit_breaker, docs_plan_v1_6_micro_backup [EXTRACTED 1.00]

## Communities (20 total, 5 thin omitted)

### Community 0 - "Backend Dependencies"
Cohesion: 0.09
Nodes (35): Alembic, Asyncpg, FastAPI Library, Passlib (bcrypt), Psutil, Pybreaker Circuit Breaker, Pydantic, PyJWT (+27 more)

### Community 1 - "Database Base Models"
Cohesion: 0.18
Nodes (28): AsyncSession, User, BaseModel, Base, DeclarativeBase, FastAPI dependency to enforce Role-Based Access Control (RBAC)., RoleChecker, RefreshToken (+20 more)

### Community 2 - "Graphify Skill System"
Cohesion: 0.07
Nodes (27): AST Extraction, Community Detection, Extraction Pipeline, God Nodes, GRAPH_REPORT.md, Graphify, Knowledge Graph, Semantic Extraction (+19 more)

### Community 3 - "Frontend Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, axios, clsx, lucide-react, next, react, react-dom, tailwind-merge (+16 more)

### Community 4 - "Identity Auth Router"
Cohesion: 0.13
Nodes (22): Any, get_me(), _hash_token(), login(), Perform refresh token rotation, invalidating old sessions., Helper to SHA-256 hash refresh tokens for secure storage., Helper to set access and refresh tokens in HttpOnly Secure cookies., Fetch current session user info. (+14 more)

### Community 5 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 6 - "Auth Context Provider"
Cohesion: 0.16
Nodes (11): AuthContext, AuthContextType, AuthProvider(), Role, useAuth(), User, DashboardLayout(), DashboardPage() (+3 more)

### Community 7 - "Audit Log Service"
Cohesion: 0.36
Nodes (7): AuditLog, Any, AsyncSession, AuditLog, create_audit_log(), Helper to create and write a user action entry to audit_logs., UUID

### Community 8 - "Auth Dependencies"
Cohesion: 0.29
Nodes (6): AsyncSession, User, get_current_user(), FastAPI dependency to extract and validate the current logged-in user from acces, FastAPI dependency that restricts endpoint strictly to SuperAdmins., superadmin_gate()

### Community 9 - "Alembic Migrations"
Cohesion: 0.40
Nodes (4): Run migrations in 'offline' mode., Run migrations in 'online' mode., run_migrations_offline(), run_migrations_online()

## Knowledge Gaps
- **75 isolated node(s):** `AsyncSession`, `Config`, `metadata`, `Role`, `User` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 11 inferred relationships involving `FastAPI Backend` (e.g. with `Alembic` and `Asyncpg`) actually correct?**
  _`FastAPI Backend` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `login()` (e.g. with `RefreshToken` and `create_access_token()`) actually correct?**
  _`login()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Run migrations in 'offline' mode.`, `Run migrations in 'online' mode.`, `AsyncSession` to the rest of the system?**
  _100 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0907563025210084 - nodes in this community are weakly interconnected._
- **Should `Graphify Skill System` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Frontend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Identity Auth Router` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._