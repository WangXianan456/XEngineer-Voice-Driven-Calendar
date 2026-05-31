import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.main import app


class FakeDeepSeekResponse:
    def __init__(self, content: str, status_code: int = 200, text: str | None = None) -> None:
        self.content = content
        self.status_code = status_code
        self.text = text if text is not None else content

    def json(self) -> dict[str, object]:
        return {
            "choices": [
                {
                    "message": {
                        "content": self.content,
                    }
                }
            ]
        }


class FakeAsyncClient:
    response: FakeDeepSeekResponse

    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> FakeDeepSeekResponse:
        return self.response


class ParseCommandApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.original_api_key = settings.deepseek_api_key
        settings.deepseek_api_key = "test-key"

    def tearDown(self) -> None:
        settings.deepseek_api_key = self.original_api_key

    def test_returns_valid_create_event_response(self) -> None:
        response = self.post_with_deepseek_content(
            {
                "intent": "create_event",
                "confidence": 0.9,
                "action": {
                    "type": "create_event",
                    "title": "产品评审会",
                    "start": "2026-06-01T15:00:00+08:00",
                    "end": "2026-06-01T16:00:00+08:00",
                    "reminderMinutes": 10,
                },
                "missingFields": [],
                "reply": "我理解为新增产品评审会。",
            }
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["intent"], "create_event")
        self.assertIn("确认", body["reply"])

    def test_downgrades_invalid_semantic_response(self) -> None:
        response = self.post_with_deepseek_content(
            {
                "intent": "delete_event",
                "confidence": 0.9,
                "action": {
                    "type": "delete_event",
                },
                "missingFields": [],
                "reply": "我会删除。",
            }
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["intent"], "unknown")
        self.assertEqual(body["missingFields"], ["targetTitle"])

    def test_rejects_non_json_deepseek_content(self) -> None:
        response = self.post_with_raw_deepseek_content("这不是 JSON")

        self.assertEqual(response.status_code, 502)
        self.assertIn("non-JSON", response.json()["detail"])

    def test_rejects_invalid_schema(self) -> None:
        response = self.post_with_deepseek_content(
            {
                "intent": "create_event",
                "action": {
                    "type": "create_event",
                    "title": "产品评审会",
                },
                "missingFields": [],
                "reply": "我理解为新增产品评审会。",
            }
        )

        self.assertEqual(response.status_code, 502)
        self.assertIn("invalid JSON schema", response.json()["detail"])

    def test_maps_deepseek_http_error_to_bad_gateway(self) -> None:
        FakeAsyncClient.response = FakeDeepSeekResponse("", status_code=500, text="upstream failed")

        with patch("backend.app.deepseek_client.httpx.AsyncClient", FakeAsyncClient):
            response = self.client.post("/api/parse-command", json=create_payload())

        self.assertEqual(response.status_code, 502)
        self.assertIn("DeepSeek request failed", response.json()["detail"])

    def test_requires_configured_api_key(self) -> None:
        settings.deepseek_api_key = ""

        response = self.client.post("/api/parse-command", json=create_payload())

        self.assertEqual(response.status_code, 503)

    def post_with_deepseek_content(self, content: dict[str, object]):
        return self.post_with_raw_deepseek_content(json.dumps(content, ensure_ascii=False))

    def post_with_raw_deepseek_content(self, content: str):
        FakeAsyncClient.response = FakeDeepSeekResponse(content)

        with patch("backend.app.deepseek_client.httpx.AsyncClient", FakeAsyncClient):
            return self.client.post("/api/parse-command", json=create_payload())


def create_payload() -> dict[str, object]:
    return {
        "text": "明天下午三点开产品评审会",
        "locale": "zh-CN",
        "timezone": "Asia/Shanghai",
        "now": "2026-05-31T10:00:00+08:00",
        "calendarContext": {
            "recentEvents": [],
            "selectedEvent": None,
        },
    }


if __name__ == "__main__":
    unittest.main()
