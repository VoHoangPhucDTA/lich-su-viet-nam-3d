# 10 — UML and diagram manifest

The package contains context, component, deployment, use-case, class, ERD, activity and sequence PlantUML sources. Structural validation checks `@startuml`/`@enduml`, balanced braces and absence of secret-like environment values. A PlantUML JAR was not present in the repository, so PNG/SVG rendering is `NOT_RENDERED`; no diagram image is fabricated.

| Artifact | Status | Purpose |
|---|---|---|
| `uml/01_system_context.puml` | SOURCE_VALIDATED | actors and external providers |
| `uml/02_component_architecture.puml` | SOURCE_VALIDATED | frontend/backend/AI/data boundaries |
| `uml/03_deployment_diagram.puml` | SOURCE_VALIDATED | browser, services, MySQL, vector store |
| `uml/04_use_case_overview.puml` | SOURCE_VALIDATED | UC-001–UC-013 |
| `uml/05_domain_class_diagram.puml` | SOURCE_VALIDATED | event/map/source/progress concepts |
| `uml/06_backend_layer_class_diagram.puml` | SOURCE_VALIDATED | controllers, services, repositories |
| `uml/07_frontend_component_diagram.puml` | SOURCE_VALIDATED | route/page/map/terrain components |
| `uml/08_database_erd.puml` | SOURCE_VALIDATED | key migration-backed relationships |
| `uml/09_activity_view_event.puml` | SOURCE_VALIDATED | event browsing flow |
| `uml/10_activity_terrain_3d.puml` | SOURCE_VALIDATED | target/session/restore flow |
| `uml/sequences/*` | SOURCE_VALIDATED | implemented/conditionally implemented sequences |
| `uml/planned/*` | PLANNED | unverified production RAG/measurement flows |

Render command after supplying PlantUML: `java -jar plantuml.jar -tpng -tsvg docs/thesis/output/uml/*.puml docs/thesis/output/uml/sequences/*.puml`.
