FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY backend/.mvn .mvn
COPY backend/mvnw backend/mvnw.cmd backend/pom.xml ./
COPY backend/src ./src
RUN chmod +x mvnw && ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app \
    && chown app:app /app
WORKDIR /app
COPY --from=build --chown=app:app /workspace/target/backend-*.jar app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=8 \
  CMD curl --fail --silent http://127.0.0.1:8080/actuator/health/liveness >/dev/null || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
