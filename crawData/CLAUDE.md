# AI Coding Guidelines: CLAUDE.md

This file contains instructions, coding conventions, architecture rules, and workflow guidelines for AI coding agents (such as Claude, GPT, Gemini, Cursor, Windsurf, etc.) working on the **Lich Su Viet Nam 3D** codebase.

---

## 1. Development Workflows

### Target Commands

*   **Crawling Textbook Data**:
    ```bash
    # Run scraper for Grade 11
    python crawData/crawler.py --grade 11
    
    # Run scraper for all grades
    python crawData/crawler.py --grade all
    
    # Resume/re-process offline HTML files without network requests
    python crawData/crawler.py --grade all --resume
    ```

*   **Frontend Development (React/Vite)**:
    ```bash
    # Navigate to frontend MVP folder
    cd MVP_KLTN
    
    # Install dependencies
    npm install
    
    # Run the client in development mode (automatically triggers build:data)
    npm run dev
    
    # Build data manifests (exams + topics) manually
    npm run build:data
    
    # Run unit tests
    npm run test
    ```

*   **AI Service Development (FastAPI/Python)**:
    ```bash
    # Navigate to AI service folder
    cd ai-service
    
    # Start the service
    python main.py
    ```

*   **Backend Development (Spring Boot/Java)**:
    ```bash
    # Navigate to backend folder
    cd backend
    
    # Run Maven compile & boot
    ./mvnw spring-boot:run
    ```

---

## 2. Core Architecture Rules

1.  **Strict 3-Tier Separation**:
    *   **Frontend (`MVP_KLTN/`)** owns client interface, 3D mapping (Cesium), and UI/UX state.
    *   **Backend (`backend/`)** owns routing, business validation, user management, and DB persistence.
    *   **AI Service (`ai-service/`)** owns vector lookup, generation, RAG logic, and external LLM/TTS integrations.
    *   *Rule*: Never write RAG or TTS processing logic inside Spring Boot; delegate it via HTTP API queries to FastAPI.
2.  **RAG Source Policy**:
    *   AI services retrieving context for historical questions must *exclusively* pull facts from crawled and structured textbook data (`textbookContent`).
    *   Ensure metadata attributes (`event_id`, `grade`, `lesson`) accompany vector DB chunks in ChromaDB.
3.  **UI/UX Component & Style Guidelines**:
    *   **NO HARDCODED HEX/RGB COLORS**: Avoid hardcoding hex strings inside JSX components. All colors must use tailwind config class names (e.g., `bg-primary`, `text-secondary`).
    *   **Component Reuse**: Abstract repeating UI patterns (buttons, boxes, cards) into generic widgets in `components/shared/`.
4.  **CesiumJS Performance**:
    *   Only load GeoJSON files (`lv0.json`, `lv1.json`) once or lazy-load them selectively. Keep viewer initializations clean to maintain sub-5 second map loading times.

---

## 3. Coding Conventions & Standards

### Python (Scrapers & AI Service)
*   **Encodings**: Force console I/O to output in UTF-8 to prevent encoding crashes under Windows command shells (refer to `crawData/crawler.py` stream wrappers).
*   **Offline First**: Always check for locally cached HTML files under `raw_html/grade_XX/` before issuing network requests.
*   **Error Handling**: Wrap HTTP requests with retries (backoff delays) and capture raw network trace exceptions. Ensure Cloudflare challenges are identified and raise clear exceptions.

### TypeScript / React
*   **Typing**: All data payloads (especially JSON payloads representing event structures, map regions, and hierarchy links) must have strict TS interfaces or types inside `types/`.
*   **State Management**: Use React Hooks cleanly. If global states are needed, employ hooks or lightweight providers rather than overcomplicating components.
*   **Language**: UI displays, user responses, and prompts should be in Vietnamese. Variable names and code structures should use clear, consistent English.

### Java (Spring Boot)
*   **Structure**: Group entities, controllers, services, and repositories into standard packages under `com.lichsuvn.backend`.
*   **Boilerplate**: Use Lombok annotations (`@Data`, `@Getter`, `@Setter`, `@NoArgsConstructor`, `@AllArgsConstructor`) to keep files concise.

---

## 4. Dos and Don'ts

### Dos
*   **DO** save raw html content locally inside `crawData/raw_html/grade_XX/` before parsing. This permits offline parser refactoring.
*   **DO** write clear Vietnamese labels for buttons and map events.
*   **DO** handle nested arrays in JSON-LD structure when retrieving breadcrumbs.
*   **DO** update `lessons_urls.py` manually if target book chapters are missing from textbook sitemaps.

### Don'ts
*   **DO NOT** make redundant web requests. Use `--resume` flags when raw HTML files are already available locally.
*   **DO NOT** allow LLMs to guess/extrapolate exact dates for fuzzy historical timeline markers. If a date is approximate (e.g., "Thế kỉ X"), set year/month/day fields to `null` and record the string directly in `displayDate`.
*   **DO NOT** push unvalidated GeoJSON coordinates into the main event DB. Run coordinates through verification scripts first.
