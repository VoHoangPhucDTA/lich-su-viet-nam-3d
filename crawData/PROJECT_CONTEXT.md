# Project Context: Lich Su Viet Nam 3D (Vietnamese History 3D)

This document provides a comprehensive overview of the **Lich Su Viet Nam 3D** project, including its core functionality, architecture, tech stack, roadmap, and design decisions. It serves as a guide for anyone (developers or AI agents) onboarding onto this repository.

---

## 1. Project Overview

**Lich Su Viet Nam 3D** is an interactive, full-stack educational web application designed to help users explore Vietnamese history dynamically. The application utilizes a 3D globe visualization to map historical events chronologically and geographically, making history learning visual and engaging.

### Key Features
*   **3D Interactive Map**: A CesiumJS-powered 3D map of Vietnam and the globe.
*   **Chronological Timeline**: Interactive timeline allowing users to browse events by date.
*   **Event Boundary Mapping**: Renders regional highlights (provinces/boundaries) based on whether an event occurred locally, nationwide, or in a specific region, using GADM geo-spatial borders.
*   **AI-Powered Quizzes & Exam Engine**: Dynamically generates quizzes and practice exams using LLMs (Large Language Models) under a Retrieval-Augmented Generation (RAG) architecture.
*   **Text-to-Speech (TTS)**: Synthesizes Vietnamese voiceover descriptions for historical events using natural-sounding AI speech.
*   **Textbook Crawler & Extractor (`crawData/`)**: A dedicated scraper and parser engine built to extract structured data from digital history textbooks (`sgkvn.com`).

---

## 2. Technical Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React (v19), TypeScript, Vite, TailwindCSS (v4), CesiumJS, Resium | Dynamic mapping and user-facing interactive interfaces. |
| **Backend** | Spring Boot (v4.0.3 parent / Java 21), Spring Data JPA, Hibernate, MySQL | Coordinates business logic, manages databases, orchestrates auth, and acts as a gateway to the AI service. |
| **AI Service** | FastAPI (Python 3.10+), LangChain, Uvicorn, ChromaDB | RAG execution, LLM-based question generation, and TTS integration. |
| **Scraper / Crawler** | Python, `curl_cffi` (impersonate Chrome 124), BeautifulSoup4 | Scrapes textbooks and chunks content into semantic structures. |

---

## 3. Repository Architecture & Directory Structure

The project separates logic cleanly into modules for the front-end, back-end, AI service, and data ingestion pipeline:

```text
lich-su-viet-nam-3d/
├── MVP_KLTN/               # Core Frontend MVP (React + Vite + Cesium)
│   ├── public/             # Static assets (favicons, map assets, etc.)
│   ├── scripts/            # Scripts to audit/suggest location coordinates and build indexes
│   ├── src/
│   │   ├── auth/           # Authentication context and route guards (RoleGuard)
│   │   ├── components/     # Reusable components (Map viewer, timeline, sidebar)
│   │   ├── data/           # Statically stored events and assets for frontend use
│   │   ├── layouts/        # Page layouts (Admin, User profile layouts)
│   │   ├── lib/            # Configuration for third-party libraries (Cesium initialization)
│   │   ├── pages/          # Main application pages (MapPage, QuizPage, ExamPage)
│   │   ├── services/       # Service layer for calling APIs (Axios)
│   │   ├── theme/          # UI Theme configuration
│   │   └── types/          # TypeScript interfaces/types (structures for mapData, hierarchy, etc.)
│   ├── package.json        # Node.js dependencies
│   └── vite.config.ts      # Vite build configuration
│
├── frontend/               # Older/skeleton frontend implementation (React setup)
│
├── backend/                # Spring Boot REST API
│   ├── src/main/java/com/lichsuvn/backend/
│   │   └── BackendApplication.java  # Core entrypoint (skeleton database connectivity test)
│   ├── src/main/resources/
│   │   └── application.properties    # Database configuration, credentials, port configuration
│   └── pom.xml             # Maven dependencies
│
├── ai-service/             # FastAPI Python service for AI capabilities
│   ├── main.py             # FastAPI routing and entrypoint
│   └── requirements.txt    # Python dependencies
│
├── crawData/               # Textbook Crawling and Parsing Pipeline
│   ├── raw_html/           # Saved local copies of 100% original HTML (offline cache)
│   │   ├── grade_10/
│   │   ├── grade_11/
│   │   └── grade_12/
│   ├── crawler.py          # Main textbook scraper (CLI support, resume mode, impersonation)
│   ├── lessons_urls.py     # Configuration array of target URLs grouped by grade
│   ├── schema_candidate.json # JSON Schema for LLM historical event candidate extraction
│   ├── event_extraction.md # Prompting guidelines and few-shot examples for LLM event extraction
│   ├── crawl_sgk_lich_su_11.py # Grade 11 legacy scraper script
│   ├── README.md           # Instructions for crawler execution
│   └── (Helpers)           # Sitemap download, filtration, and url extraction scripts
│
└── data/                   # Geographic boundary borders (GADM GeoJSON files)
    ├── gadm/               # GeoJSON boundaries (lv0.json, lv1.json)
    └── processed/          # Standardized event outputs
```

---

## 4. Feature Status

### Completed Features
*   **CesiumJS 3D Viewer**: Successfully integrates `resium` into React with coordinate translation.
*   **Dynamic Province Highlights**: Parses event metadata (`geoType` = `multi_region`, `nationwide`, etc.) and dynamically highlights corresponding GADM provinces (lv1.json / lv0.json) on Cesium.
*   **History Scraper**: Robust Cloudflare-bypassing textbook scraper supporting automatic page markers, content blocking (tables, text, citations, questions, images), caching, and resume mode.
*   **Event Data Extraction Schema**: Designed a comprehensive 16-block event schema (with precision chronology, references, and place names) ready for LLM processing.
*   **Curated Event Tree Dataset**: `crawData/stage4b_curate_tree/output/phase2/` now exports a validated hierarchical dataset for map, timeline, and drill-down: 361 core nodes, 50 supporting items, 9 synthetic root periods, and 6 synthetic collection nodes with validation errors = 0.
*   **Quiz & Exam Front-end Modules**: Full suite of screens for taking exams, reviewing results, browsing history, and practicing themes.
*   **Coordinate Audit Tools**: Node scripts to audit, suggest, and apply coordinates for geographic mentions inside historical datasets.

### In-Progress Features
*   **AI Event Extraction Pipeline**: Feeding crawled raw textbooks to LLMs (using the system instructions in `event_extraction.md`) to extract structured event candidates.
*   **Spring Boot Backend Setup**: Implementing controllers, repositories, and services to replace hardcoded client JSON files.
*   **FastAPI RAG Backend**: Expanding the `/generate-question` endpoint with vector store query logic.

### Pending Features
*   **TTS Voice Integration**: Incorporating FPT.AI TTS API into the event narration player.
*   **ChromaDB Vector Ingestion**: Script to chunk textbook files and index them into vector space.
*   **Drill-down Events Map UI Integration**: The curated parent-child dataset exists in Stage 4B; the remaining work is wiring `core_events.jsonl` and `event_tree.json` into the frontend interaction model.

---

## 5. Important Technical Decisions

1.  **Cloudflare Bypass using `curl_cffi`**: Since target textbook servers block standard python `requests` using Cloudflare checks, the crawler utilizes `curl_cffi` with `chrome124` impersonation to load URLs reliably.
2.  **HTML Archiving Before Parsing**: Crawler downloads and stores 100% raw HTML into `raw_html/` before processing. If parser logic changes, the HTML files can be processed offline (`--resume`), minimizing traffic load and avoiding bot detection.
3.  **Strict Chronological Handling in LLMs**: To prevent LLMs from hallucinating specific dates from vague strings, the extraction schema forces specific formats. If the text says "End of 19th Century", month, day, and year are set to `null` and the text is copied into `displayDate`.
4.  **Tailwind Color Variables**: React files strictly avoid inline/hex styling values. Components must use Tailwind class names that reference coordinates inside the theme config to ensure design consistency.
5.  **Multi-Stage Location Resolution**: Geographic places mentioned in textbooks are extracted as raw strings (`rawPlaceMentions`). They are matched and converted into coordinate locations in a separate script rather than directly inside the scraping phase.

---

## 6. Known Issues & Next Steps

*   **Incomplete Sitemap Indexing**: `sgkvn.com` sitemaps do not contain all textbook links (e.g., Grade 10 has only 8/14 links). URLs must be manually populated in `lessons_urls.py` when missing.
*   **Spring Boot Database Schema**: The Spring Boot app connects successfully to MySQL but is missing Entity definitions. DB tables matching the event candidate schema need modeling.
*   **FastAPI TTS Setup**: Need to configure FPT.AI API credentials to allow voiceovers.
