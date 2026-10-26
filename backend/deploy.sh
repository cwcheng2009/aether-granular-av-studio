#!/usr/bin/env bash
set -e

REGION="asia-east1"
FUNCTION_NAME="ai-service"

echo "=== 正在檢查 gcloud 登入與專案狀態 ==="
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")

if [ -z "$PROJECT_ID" ]; then
  echo "錯誤：未設定 GCP 專案 ID，請先執行: gcloud config set project <PROJECT_ID>"
  exit 1
fi

echo "使用專案: $PROJECT_ID | 區域: $REGION"

echo "=== 正在部署 Cloud Functions (Gen2) ==="
gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=python311 \
  --region="$REGION" \
  --source=. \
  --entry-point=ai_service \
  --trigger-http \
  --allow-unauthenticated

echo "=== 部署完成，正在取得 API 網址 ==="
URL=$(gcloud functions describe "$FUNCTION_NAME" --gen2 --region="$REGION" --format="value(serviceConfig.uri)")
echo "Cloud Functions API URL: $URL"
