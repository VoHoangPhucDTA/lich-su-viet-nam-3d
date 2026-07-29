# 13 — Technology and version evidence

| Package/tool | Declared | Resolved/runtime | Source |
| --- | --- | --- | --- |
| @eslint/js | ^9.39.1 | 9.39.4 | frontend/package.json; frontend/package-lock.json |
| @tailwindcss/vite | ^4.2.1 | 4.2.1 | frontend/package.json; frontend/package-lock.json |
| @testing-library/jest-dom | ^6.9.1 | 6.9.1 | frontend/package.json; frontend/package-lock.json |
| @testing-library/react | ^16.3.2 | 16.3.2 | frontend/package.json; frontend/package-lock.json |
| @testing-library/user-event | ^14.6.1 | 14.6.1 | frontend/package.json; frontend/package-lock.json |
| @types/node | ^24.10.1 | 24.12.0 | frontend/package.json; frontend/package-lock.json |
| @types/react | ^19.2.7 | 19.2.14 | frontend/package.json; frontend/package-lock.json |
| @types/react-dom | ^19.2.3 | 19.2.3 | frontend/package.json; frontend/package-lock.json |
| @vitejs/plugin-react | ^5.1.1 | 5.1.4 | frontend/package.json; frontend/package-lock.json |
| canonicalize | 3.0.0 | 3.0.0 | frontend/package.json; frontend/package-lock.json |
| cesium | ^1.139.1 | 1.139.1 | frontend/package.json; frontend/package-lock.json |
| eslint | ^9.39.1 | 9.39.4 | frontend/package.json; frontend/package-lock.json |
| eslint-plugin-react-hooks | ^7.0.1 | 7.0.1 | frontend/package.json; frontend/package-lock.json |
| eslint-plugin-react-refresh | ^0.4.24 | 0.4.26 | frontend/package.json; frontend/package-lock.json |
| globals | ^16.5.0 | 16.5.0 | frontend/package.json; frontend/package-lock.json |
| jsdom | ^29.1.1 | 29.1.1 | frontend/package.json; frontend/package-lock.json |
| json-dup-key-validator | 1.0.3 | 1.0.3 | frontend/package.json; frontend/package-lock.json |
| lucide-react | ^1.11.0 | 1.11.0 | frontend/package.json; frontend/package-lock.json |
| react | ^19.2.0 | 19.2.4 | frontend/package.json; frontend/package-lock.json |
| react-dom | ^19.2.0 | 19.2.4 | frontend/package.json; frontend/package-lock.json |
| react-router-dom | ^7.13.1 | 7.13.1 | frontend/package.json; frontend/package-lock.json |
| recharts | ^3.9.2 | 3.9.2 | frontend/package.json; frontend/package-lock.json |
| resium | ^1.19.4 | 1.19.4 | frontend/package.json; frontend/package-lock.json |
| tailwindcss | ^4.2.1 | 4.2.1 | frontend/package.json; frontend/package-lock.json |
| typescript | ~5.9.3 | 5.9.3 | frontend/package.json; frontend/package-lock.json |
| typescript-eslint | ^8.48.0 | 8.57.0 | frontend/package.json; frontend/package-lock.json |
| vite | ^7.3.1 | 7.3.1 | frontend/package.json; frontend/package-lock.json |
| vite-plugin-static-copy | ^3.2.0 | 3.2.0 | frontend/package.json; frontend/package-lock.json |
| vitest | ^4.1.10 | 4.1.10 | frontend/package.json; frontend/package-lock.json |
| Java | 21 | — | backend/pom.xml |
| Spring Boot | 4.0.3 | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-actuator | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-data-jpa | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-webmvc | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-security | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-validation | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-mail | managed | — | backend/pom.xml |
| io.github.cdimascio:dotenv-java | 3.2.0 | — | backend/pom.xml |
| io.github.erdtman:java-json-canonicalization | 1.1 | — | backend/pom.xml |
| org.springframework.boot:spring-boot-devtools | managed | — | backend/pom.xml |
| com.mysql:mysql-connector-j | managed | — | backend/pom.xml |
| org.projectlombok:lombok | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-actuator-test | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-data-jpa-test | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-webmvc-test | managed | — | backend/pom.xml |
| com.h2database:h2 | managed | — | backend/pom.xml |
| org.springframework.security:spring-security-test | managed | — | backend/pom.xml |
| org.springframework.boot:spring-boot-starter-flyway | managed | — | backend/pom.xml |
| org.flywaydb:flyway-mysql | managed | — | backend/pom.xml |
| com.cloudinary:cloudinary-http5 | 2.0.0 | — | backend/pom.xml |
| org.testcontainers:junit-jupiter | ${testcontainers.version} | — | backend/pom.xml |
| org.testcontainers:mysql | ${testcontainers.version} | — | backend/pom.xml |
| fastapi | ==0.133.0 | — | ai-service/requirements.txt |
| chromadb | ==1.5.9 | — | ai-service/requirements.txt |
| google-genai | ==2.12.1 | — | ai-service/requirements.txt |
| pydantic-settings | ==2.13.1 | — | ai-service/requirements.txt |
| tenacity | ==9.1.4 | — | ai-service/requirements.txt |
| uvicorn | ==0.41.0 | — | ai-service/requirements.txt |

## Technology corrections

- **LangChain:** not found in `ai-service/requirements.txt` or AI source; thesis wording must not present it as current implementation.
- **TTS:** active adapter is `ViettelTextToSpeechProvider`; FPT.AI appears only in legacy/documentation references.
- **Cesium terrain:** viewer default is `EllipsoidTerrainProvider`; World Terrain is conditional on `VITE_CESIUM_ION_TOKEN`.
- **AI/RAG:** FastAPI, ChromaDB and Google GenAI are declared; service health, corpus and quality were not runtime verified.
- **Persistence:** Spring Data JPA and JDBC templates coexist; describe it as hybrid.
