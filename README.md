# Vietnam History Learning Platform

A full-stack learning platform that helps high-school students explore Vietnamese history, connect historical events with their time and location, and practise exam questions using textbook-grounded AI assistance.

The platform brings historical discovery, geographic visualisation, exam practice and learning progress into one experience. It was developed as a graduation-thesis project and is maintained as a multi-service software application.

## Key features

- **Explore Vietnamese history:** Search and filter historical events, browse a timeline, and navigate events through an interactive map.
- **Understand historical context:** View event details, chronology, geographic context, related events and available source references.
- **Explore history geographically:** Use an interactive map with supported 3D geographic visualisation.
- **Learn through narration:** Listen to Vietnamese text-to-speech narration where audio assets and provider configuration are available.
- **Practise with textbook content:** Generate multiple-choice practice questions from relevant textbook passages retrieved through the RAG workflow.
- **Prepare for the THPT exam:** Browse exam materials, complete timed practice sessions, submit answers and review results.
- **Track learning activity:** Review personal learning activity and progress after signing in.
- **Manage platform content:** Role-restricted administration features support historical content and user-account management.

> Some capabilities depend on data coverage, environment configuration and external provider availability. A feature being present in the codebase does not mean every integration is enabled in every deployment.

## System architecture

The application is separated into a browser client, a Java/Spring Boot application backend and a Python/FastAPI AI service. Application records, vector data and media assets are stored in dedicated services, while external providers are accessed through the service that owns each integration.

~~~mermaid
flowchart LR
    learner[Student / Administrator]

    subgraph client[Browser Client]
        ui[React 19 + TypeScript + Vite]
        map[CesiumJS / Resium<br/>Interactive map]
        google[Google Identity Services]
        ui --- map
    end

    subgraph app[Application Server]
        api[Java 21<br/>Spring Boot REST API]
        auth[Authentication, authorisation<br/>and application workflows]
        ai[Python<br/>FastAPI AI Service]
        rag[RAG retrieval, validation<br/>and question generation]
        api --- auth
        ai --- rag
    end

    subgraph storage[Data and Media]
        mysql[(MySQL-compatible DB<br/>TiDB Cloud)]
        chroma[(ChromaDB<br/>Vector Store)]
        media[(Cloudinary<br/>Media Assets)]
    end

    subgraph external[External Providers]
        gemini[Google Gemini API<br/>Embedding + Generation]
        viettel[Viettel AI<br/>Text-to-Speech]
        smtp[SMTP Email Service]
    end

    subgraph sources[Learning and Reference Sources]
        textbooks[History Textbooks]
        exams[THPT Exam Materials]
        refs[Historical / Geographic References<br/>Wikidata and GeoJSON]
        ingest[Data Preparation and Import]
        textbooks --> ingest
        exams --> ingest
        refs --> ingest
    end

    learner --> ui
    ui <-->|HTTPS / REST JSON| api
    ui -->|Google ID token| api
    api <-->|Token verification| google
    api <-->|JPA / JDBC| mysql
    api <-->|Internal REST request| ai
    ai <-->|Vector retrieval| chroma
    ai <-->|Embeddings and generation| gemini
    api --> media
    api --> viettel
    api --> smtp
    ingest --> mysql
    ingest --> chroma
~~~

### Main components

| Component | Responsibility |
| --- | --- |
| **React frontend** | Provides the Vietnamese user interface, application navigation, map interactions, event browsing, quizzes and exam practice. |
| **CesiumJS / Resium** | Renders the interactive map and supported 3D geographic experiences. |
| **Spring Boot backend** | Exposes REST APIs and owns application workflows, user accounts, access control, historical content, exam sessions and persistence. |
| **FastAPI AI service** | Handles textbook retrieval, AI-assisted question generation and generation-related validation separately from the main application API. |
| **MySQL-compatible database** | Stores users, historical events, learning activity, exam data and other application records. The project has used TiDB Cloud as its managed MySQL-compatible database. |
| **ChromaDB** | Stores textbook embeddings and metadata used for semantic retrieval. |
| **Cloudinary** | Stores and delivers supported media assets. |
| **External providers** | Gemini provides embedding and generation models; Viettel AI provides text-to-speech; SMTP supports email delivery; Google Identity Services supports Google sign-in. |

## AI-assisted learning: RAG workflow

The AI functionality is implemented as a separate service so retrieval and generation responsibilities are isolated from the main Java application.

1. **Prepare learning materials.** History textbook content is extracted, cleaned, normalised and split into retrievable text chunks.
2. **Create embeddings.** Gemini Embedding 2 converts textbook chunks and learner queries into vector representations.
3. **Index the corpus.** ChromaDB stores vectors with metadata that helps identify the source passages.
4. **Retrieve context.** When a learner requests practice questions, the Spring Boot backend forwards the request to the internal FastAPI service. The AI service searches ChromaDB for relevant passages.
5. **Generate questions.** Retrieved passages are supplied as context to Gemini 2.5 Flash to generate multiple-choice questions and explanations.
6. **Validate and return.** The AI service applies output and factual/provenance checks before returning the generated result to the backend and frontend.

The workflow is designed to ground generated practice material in the project's textbook corpus. Retrieval and source references improve traceability, but do not guarantee that every generated statement is historically correct. AI-generated content should be reviewed against authoritative learning materials.

## Technology stack

| Layer | Technologies | Purpose |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4 | User interface and client-side application |
| Mapping | CesiumJS, Resium, GeoJSON | Interactive map and supported 3D geographic visualisation |
| Backend | Java 21, Spring Boot 4, Spring Security, Spring Data JPA, Spring JDBC, Maven | REST APIs, authentication, access control, business logic and data access |
| Database | MySQL-compatible database / TiDB Cloud, Flyway | Application persistence and schema migrations |
| AI service | Python 3.10+, FastAPI, Google GenAI SDK | Retrieval and AI-assisted question generation |
| Vector database | ChromaDB | Persistent vector index for textbook passages |
| AI models | Gemini Embedding 2, Gemini 2.5 Flash | Text embedding and question generation |
| Integrations | Google Identity Services, Cloudinary, Viettel AI, SMTP | Google sign-in, media delivery, narration and email |

## Authentication and security

- Users can register and sign in using the application's email/password flow.
- Google sign-in uses Google Identity Services. The browser sends the returned ID token to the Spring Boot backend, which independently validates the token before establishing an application session.
- **Google sign-in is working in the current deployment.** For another environment, configure the same Google Web Client ID in the frontend and backend, and register the exact frontend origin in Google Cloud Console.
- The backend issues authentication tokens through **HttpOnly cookies** rather than exposing access and refresh tokens to browser JavaScript or storing them in local storage.
- CSRF protection and explicit credentialed CORS origins are configured for browser-to-API requests.
- Role-based access control protects administrator functionality.

## Repository structure

~~~text
lich-su-viet-nam-3d/
├── frontend/       # Active React + TypeScript + Vite application
├── backend/        # Java / Spring Boot REST API
├── ai-service/     # Python / FastAPI retrieval and generation service
│   ├── app/        # API, retrieval, generation and runtime modules
│   ├── data/       # Textbook corpus and evaluation data
│   └── storage/    # ChromaDB and embedding artifacts
├── data/           # Historical, geographic and exam datasets
├── scripts/        # Data preparation, import, evaluation and maintenance
├── docs/           # Architecture, thesis and engineering documentation
├── MVP_KLTN/       # Earlier prototype; not the active full-stack application
└── README.md
~~~

## Run locally

### Prerequisites

- Java 21
- Node.js and npm compatible with Vite 7
- Python 3.10 or later
- MySQL 8-compatible database or a compatible TiDB instance
- Gemini API key for live embedding and generation requests
- Optional credentials for Google sign-in, email, Cloudinary and Viettel AI features

### 1. Configure the backend

~~~bash
cp backend/.env.example backend/.env
~~~

On Windows PowerShell:

~~~powershell
Copy-Item backend/.env.example backend/.env
~~~

Configure the database connection (SPRING_DATASOURCE_URL, SPRING_DATASOURCE_USERNAME and SPRING_DATASOURCE_PASSWORD), a strong APP_JWT_SECRET, APP_FRONTEND_BASE_URL and APP_ALLOWED_ORIGINS. Create the target database before starting the service. Flyway migrations are configured to run at backend startup.

For local development, APP_ALLOWED_ORIGINS should include the exact local frontend origin, normally http://localhost:5173.

### 2. Configure and start the AI service

~~~bash
cd ai-service
python -m venv .venv
~~~

Activate the environment:

~~~powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
~~~

~~~bash
# macOS / Linux
source .venv/bin/activate
~~~

Install dependencies and configure environment variables:

~~~bash
pip install -r requirements.txt
cp .env.example .env
~~~

Set GEMINI_API_KEY and AI_SERVICE_INTERNAL_TOKEN in ai-service/.env. The internal token must match the value configured for the Spring Boot backend. Start the service:

~~~bash
uvicorn app.main:app --host 127.0.0.1 --port 8001
~~~

Health endpoint: http://127.0.0.1:8001/ai/health.

### 3. Start the Spring Boot backend

From the repository root, configure backend/.env and ensure its AI service URL and internal token point to the running FastAPI service.

~~~powershell
# Windows PowerShell
cd backend
.\mvnw.cmd spring-boot:run
~~~

~~~bash
# macOS / Linux
cd backend
./mvnw spring-boot:run
~~~

The backend listens on http://localhost:8080 by default.

### 4. Start the frontend

~~~bash
cd frontend
npm ci
~~~

For local development, leave VITE_API_BASE_URL empty so Vite's /api proxy can forward requests to the backend at http://localhost:8080. Then start the frontend:

~~~bash
npm run dev
~~~

Open http://localhost:5173 in a browser.

### 5. Run tests and checks

Frontend:

~~~bash
cd frontend
npm test
npm run build
npm run lint
~~~

Backend:

~~~bash
cd backend
./mvnw test
~~~

AI service:

~~~bash
cd ai-service
pip install -r requirements-dev.txt
python -m pytest
~~~

The commands above describe how to run the project checks. Actual results depend on the local database, Docker availability for container-backed tests, installed development dependencies, test fixtures and configured external services.

## Environment configuration reference

| Variable | Service | Description |
| --- | --- | --- |
| VITE_GOOGLE_CLIENT_ID | Frontend | Public Google Web Client ID used by Google Identity Services. |
| APP_AUTH_GOOGLE_CLIENT_ID | Backend | The same Web Client ID, used to validate the token audience. |
| APP_ALLOWED_ORIGINS | Backend | Comma-separated list of exact frontend origins allowed to make credentialed API requests. |
| SPRING_DATASOURCE_URL | Backend | JDBC connection URL for MySQL-compatible storage. |
| APP_JWT_SECRET | Backend | Server-side secret used for application JWT signing. |
| AI_SERVICE_INTERNAL_TOKEN | Backend + AI service | Shared internal credential for backend-to-AI-service requests. |
| GEMINI_API_KEY | AI service | Server-side key for Gemini embedding and generation requests. |
| VITE_CESIUM_ION_TOKEN | Frontend | Public, restricted Cesium browser token for configured terrain features. |
| CLOUDINARY_* | Backend | Server-side Cloudinary credentials for media operations. |
| APP_VIETTEL_AI_TOKEN | Backend | Server-side Viettel AI credential for text-to-speech. |

Never commit .env files, API keys, OAuth client secrets, database passwords, JWT secrets or Cloudinary private credentials. Variables prefixed with VITE_ are embedded in browser assets and must not contain secrets.

## Current scope and limitations

- Terrain visualisation is available only for events with supported geographic data and the required Cesium configuration; the default map does not imply global terrain coverage.
- AI generation, narration, email and media operations depend on external credentials and provider availability.
- AI-generated questions are learning aids and should be reviewed against authoritative materials.
- The repository includes a legacy MVP_KLTN/ prototype. The active application is the frontend/, backend/ and ai-service/ combination documented above.
- The project is a software prototype developed as a graduation thesis. It should not be interpreted as a validated study of educational outcomes or as a production service-level commitment.

## Further documentation

The docs/ directory contains additional thesis evidence, architecture notes, feature inventories, test notes, database documentation and engineering decisions.
