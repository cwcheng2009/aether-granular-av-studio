import os
import json
import functions_framework
from flask import jsonify

ALLOWED_ORIGINS = [
    "https://cwcheng2009.github.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080"
]

def build_cors_headers(origin):
    headers = {}
    if origin in ALLOWED_ORIGINS or (origin and origin.startswith("https://cwcheng2009.github.io")):
        headers["Access-Control-Allow-Origin"] = origin
    else:
        headers["Access-Control-Allow-Origin"] = "https://cwcheng2009.github.io"
        
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    headers["Access-Control-Max-Age"] = "3600"
    return headers

@functions_framework.http
def ai_service(request):
    """
    Google Cloud Functions 進入點：
    處理來自前端的 AI 請求，金鑰由 GCP 雲端環境保管，不外露給用戶端。
    """
    origin = request.headers.get("Origin", "")
    cors_headers = build_cors_headers(origin)

    # 1. 處理 CORS Preflight (OPTIONS) 請求
    if request.method == "OPTIONS":
        return ("", 204, cors_headers)

    # 2. 僅允許 POST 方法
    if request.method != "POST":
        return (jsonify({"error": "Method Not Allowed"}), 405, cors_headers)

    try:
        request_json = request.get_json(silent=True) or {}
        prompt = request_json.get("prompt", "").strip()
        system_instruction = request_json.get(
            "system_instruction",
            "You are an expert audio-visual sound designer assistant for the Ilab Granular Audio-Visual Studio."
        )

        if not prompt:
            return (jsonify({"error": "Missing 'prompt' field in request body"}), 400, cors_headers)

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        project_id = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT") or "project-3d5f4cd8-5b52-460a-984"
        location = os.environ.get("VERTEX_LOCATION", "us-central1")

        from google import genai

        if api_key:
            client = genai.Client(api_key=api_key)
        else:
            # 使用 Vertex AI (預設 us-central1 支援全系列 Gemini 模型)
            client = genai.Client(vertexai=True, project=project_id, location=location)

        model_name = request_json.get("model", "gemini-3.8-flash")

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={"system_instruction": system_instruction}
        )

        return (jsonify({
            "status": "success",
            "reply": response.text
        }), 200, cors_headers)

    except Exception as e:
        return (jsonify({
            "status": "error",
            "message": str(e)
        }), 500, cors_headers)
