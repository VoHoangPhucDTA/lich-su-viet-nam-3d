# PROJECT CONTEXT: Vietnamese History 3D Web App (Graduation Thesis)

## 1. Project Overview
- **Description**: A web application designed to help Vietnamese high school students (Grades 10-12) learn Vietnamese History interactively.
- **Core Value**: Combines 3D spatial visualization (CesiumJS) with time-series data (Timeline) and Generative AI (RAG for MCQ generation, TTS for audio reading).
- **Target Audience**: High school students and teachers in Vietnam.

## 2. Architecture & Tech Stack (3-Tier)
The system strictly follows a separated 3-tier architecture:
- **Frontend (Presentation Layer)**:
  - Framework: React.js with TypeScript.
  - Styling: Tailwind CSS.
  - 3D Mapping: CesiumJS (Cesium World Terrain) for interactive 3D globe, markers, polygons, and timeline.
- **Backend (Application Layer - Core Business)**:
  - Framework: Spring Boot (Java).
  - Responsibilities: User management, event CRUD, progress tracking, exam management, and coordinating API calls to the AI Service.
- **AI Service (Application Layer - AI/ML)**:
  - Framework: FastAPI (Python).
  - Workflow: LangChain.
  - Responsibilities: RAG pipeline (Retrieval-Augmented Generation) for MCQ quiz generation, invoking external TTS (FPT.AI).
- **Data Layer (3-Layer Strategy)**:
  - Relational DB: MySQL (Users, Event metadata, Scores).
  - Vector DB: ChromaDB (Storing embeddings of textbook chunks for RAG).
  - Spatial Data: GeoJSON (GADM level 1 boundaries for 63 provinces in Vietnam).

## 3. Core Data Structure: Historical Event JSON
When working with Event Data, adhere to this strict structure/logic:
- `hierarchy`: Defines parent-child relationships (Crucial for drill-down interactions on the map).
- `mapData`: Contains spatial instructions.
  - `geoType`: Must be one of `point`, `multi_point`, `polygon`, `multi_polygon`, `nationwide`, `no_location`, or `mixed`. Determines how CesiumJS renders the entity.
- `sourcePolicy`: 
  - `textbookContent`: Content from official textbooks. **MUST** be the ONLY source used for RAG chunking and indexing to prevent AI hallucinations.
  - `externalContent`: Supplemental data (e.g., Wikipedia) for UI display only, NEVER for AI generation.

## 4. Key AI Rules (Cursor Instructions)
When writing or modifying code for this project, Cursor must obey the following rules:
- **Language**: Use Vietnamese for all UI elements, labels, and AI prompt engineering instructions. Code comments can be in English or Vietnamese.
- **CesiumJS Rendering**: Be mindful of performance. Implement lazy-loading for GeoJSON polygons and use simplified geometries when rendering multiple provinces. Ensure `displayGeometry` and `focusGeometry` are handled separately if camera fly-to points differ from markers.
- **RAG Pipeline (FastAPI/LangChain)**: Ensure the prompt engineering strictly forces the LLM to output 4-option MCQs (A/B/C/D) based ONLY on the retrieved chunks. Incorporate metadata (`keyFacts`, `tags`, `provinceNames`) into chunks to improve retrieval accuracy for Vietnamese historical entities.
- **Separation of Concerns**: Do not mix AI logic into the Spring Boot backend. Spring Boot merely acts as an API Gateway/Coordinator calling the FastAPI endpoints.

## 5. Development Workflows
- **Map Interaction (Drill-down)**: When a parent event is clicked -> hide peer markers -> show child markers/polygons -> update sidebar -> fly camera to the corresponding `focusGeometry`.
- **Quiz Generation**: User selects topic/grade -> Spring Boot calls FastAPI -> FastAPI retrieves chunks from ChromaDB -> LangChain formats prompt -> LLM generates MCQ -> FastAPI returns to Spring Boot -> React displays to User.