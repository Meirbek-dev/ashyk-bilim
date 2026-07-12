from src.db.ai_runtime import AIEvent, AIRun, AIRunStatus
from src.routers.ai.runs import AIRunStreamRequest, _ag_ui_event, _ag_ui_terminal_event


def test_run_stream_maps_persisted_events_to_ag_ui() -> None:
    event = AIEvent(
        run_id=1,
        event_id="event_1",
        event_type="progress",
        sequence=1,
        payload_json={"state": "running", "message": "Working"},
    )

    assert _ag_ui_event(event) == {
        "type": "CUSTOM",
        "name": "progress",
        "value": {
            "state": "running",
            "message": "Working",
            "payload": {"state": "running", "message": "Working"},
        },
    }


def test_run_stream_emits_ag_ui_terminal_events() -> None:
    payload = AIRunStreamRequest(threadId="thread_1", runId="run_1")
    finished = AIRun(run_uuid="stored_1", thread_id=1, status=AIRunStatus.FINISHED.value)
    failed = AIRun(run_uuid="stored_2", thread_id=1, status=AIRunStatus.ERROR.value, error_code="MODEL_FAILED")

    assert _ag_ui_terminal_event(finished, payload) == {
        "type": "RUN_FINISHED",
        "threadId": "thread_1",
        "runId": "run_1",
    }
    assert _ag_ui_terminal_event(failed, payload) == {
        "type": "RUN_ERROR",
        "message": "AI run failed",
        "code": "MODEL_FAILED",
    }
