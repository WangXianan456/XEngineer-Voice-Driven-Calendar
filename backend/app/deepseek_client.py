import json
import re
from typing import Any

import httpx
from fastapi import HTTPException

from .config import settings
from .schemas import ParseCommandRequest, ParseCommandResponse


SYSTEM_PROMPT = """你是一个日历指令解析器。请把用户中文自然语言解析成严格 JSON。
只输出 JSON，不要输出 Markdown。
不要直接执行任何日历写入、修改或删除。
如果信息不足，请填写 missingFields。
不要编造时间、标题、地点。
所有时间使用 ISO 8601，并使用请求里的 timezone。

输出 JSON 结构：
{
  "intent": "create_event | list_events | update_event | delete_event | find_free_time | set_reminder | confirm | cancel | unknown",
  "confidence": 0.0,
  "action": {
    "type": "create_event | list_events | update_event | delete_event | find_free_time | set_reminder",
    "title": "日程标题，可空",
    "start": "ISO 8601，可空",
    "end": "ISO 8601，可空",
    "reminderMinutes": 10,
    "location": "",
    "notes": "",
    "targetTitle": "要修改或删除的日程标题，可空",
    "targetDate": "要查询、修改或删除的日期，可空",
    "eventId": "如果上下文能唯一确定事件，可填"
  },
  "missingFields": [],
  "reply": "给用户的中文确认或追问"
}

安全规则：
- 删除事件只返回候选目标，不要声称已经删除。
- 修改事件只返回目标匹配条件和新字段，不要声称已经修改。
- 时间不明确时必须追问。
- 置信度低于 0.7 时必须要求确认或补充。
"""


async def parse_with_deepseek(payload: ParseCommandRequest) -> ParseCommandResponse:
    if not settings.deepseek_api_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured")

    user_payload = {
        "text": payload.text,
        "locale": payload.locale,
        "timezone": payload.timezone,
        "now": payload.now,
        "calendarContext": payload.calendarContext.model_dump(),
    }

    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.post(
            _chat_completions_url(),
            headers={
                "Authorization": f"Bearer {settings.deepseek_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.deepseek_model,
                "temperature": 0.1,
                "max_tokens": settings.deepseek_max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
            },
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"DeepSeek request failed: {response.text[:500]}")

    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = _parse_json_content(content)

    try:
        return ParseCommandResponse.model_validate(parsed)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DeepSeek returned invalid JSON schema: {exc}") from exc


def _parse_json_content(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"DeepSeek returned non-JSON content: {cleaned[:500]}") from exc


def _chat_completions_url() -> str:
    base_url = settings.deepseek_base_url.rstrip("/")
    return f"{base_url}/chat/completions"
