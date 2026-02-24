from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="AI Service - Lịch Sử Việt Nam",
    description="Module AI: RAG Question Generator + TTS cho ứng dụng học Lịch sử",
    version="1.0.0"
)

# CORS để frontend React (localhost:5173) gọi được
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],  # sau này thay bằng domain thật
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoint health check để test server chạy
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ai-service"}

# Endpoint mẫu cho RAG (sẽ mở rộng sau)
@app.get("/generate-question")
def generate_question(topic: str = "Kháng chiến chống Pháp"):
    return {"question": f"Câu hỏi mẫu về {topic}", "answer": "..."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)