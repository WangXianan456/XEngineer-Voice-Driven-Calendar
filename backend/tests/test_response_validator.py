import unittest

from backend.app.response_validator import validate_parse_command_response
from backend.app.schemas import ParsedAction, ParseCommandResponse


class ResponseValidatorTest(unittest.TestCase):
    def test_accepts_valid_create_event(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="create_event",
                confidence=0.9,
                action=ParsedAction(
                    type="create_event",
                    title="产品评审会",
                    start="2026-06-01T15:00:00+08:00",
                    end="2026-06-01T16:00:00+08:00",
                    reminderMinutes=10,
                ),
                reply="我理解为新增产品评审会。",
            )
        )

        self.assertEqual(response.intent, "create_event")
        self.assertIn("确认", response.reply)

    def test_downgrades_create_without_start_time(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="create_event",
                confidence=0.9,
                action=ParsedAction(type="create_event", title="产品评审会"),
                reply="我理解为新增产品评审会。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["start"])

    def test_downgrades_invalid_time_range(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="create_event",
                confidence=0.9,
                action=ParsedAction(
                    type="create_event",
                    title="产品评审会",
                    start="2026-06-01T16:00:00+08:00",
                    end="2026-06-01T15:00:00+08:00",
                ),
                reply="我理解为新增产品评审会。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["start", "end"])

    def test_downgrades_delete_without_target(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="delete_event",
                confidence=0.9,
                action=ParsedAction(type="delete_event"),
                reply="我会删除。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["targetTitle"])

    def test_downgrades_update_without_new_value(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="update_event",
                confidence=0.9,
                action=ParsedAction(type="update_event", targetTitle="产品评审会"),
                reply="我会修改。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["start", "reminderMinutes"])

    def test_downgrades_action_type_mismatch(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="delete_event",
                confidence=0.9,
                action=ParsedAction(type="update_event", targetTitle="产品评审会"),
                reply="我会删除。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["action.type"])

    def test_downgrades_invalid_reminder(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="set_reminder",
                confidence=0.9,
                action=ParsedAction(
                    type="set_reminder",
                    targetTitle="产品评审会",
                    reminderMinutes=-5,
                ),
                reply="我会设置提醒。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["reminderMinutes"])

    def test_downgrades_low_confidence_action(self) -> None:
        response = validate_parse_command_response(
            ParseCommandResponse(
                intent="delete_event",
                confidence=0.1,
                action=ParsedAction(type="delete_event", targetTitle="产品评审会"),
                reply="我会删除。",
            )
        )

        self.assertEqual(response.intent, "unknown")
        self.assertEqual(response.missingFields, ["confidence"])


if __name__ == "__main__":
    unittest.main()
