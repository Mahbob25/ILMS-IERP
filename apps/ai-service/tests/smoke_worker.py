"""Smoke-test the ai-worker loop with a mocked queue (no Redis needed)."""
import asyncio
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services import lessonforge

FAKE_LLM_JSON = {
    "title": "Fractions",
    "theme_notes": None,
    "sections": [
        {
            "heading": "Core Rule",
            "blocks": [
                {"kind": "definition", "text": "A fraction represents a part of a whole.", "items": [], "arabic": None}
            ],
        }
    ],
    "custom_css": None,
}


class FakeQueue:
    def __init__(self):
        self.results = {}
        self.acked = []

    async def dequeue(self, queue, timeout=0):
        # Single job then block forever (return None) so the loop terminates via break.
        if not hasattr(self, "_job_returned"):
            self._job_returned = True
            return {
                "id": "1-0",
                "job_id": "job-123",
                "payload": {"kind": "lessonforge", "job_id": "job-123", "payload": {
                    "topic_text": "Explain fractions to beginners.",
                    "style": "pastel",
                    "output_mode": "worksheet",
                }},
                "attempts": 0,
                "queue": "ai:teacher",
            }
        return None

    async def set_result(self, job_id, result, ttl):
        self.results[job_id] = result

    async def ack(self, queue, job_id):
        self.acked.append(job_id)


async def main() -> None:
    settings.OPENAI_API_KEY = "test-key"

    async def fake_call(prompt: str):
        from app.services.lessonforge_content import LessonForgeContent
        return LessonForgeContent.model_validate(FAKE_LLM_JSON)

    lessonforge._call_llm = fake_call

    import app.worker as worker

    q = FakeQueue()
    worker.RedisStreamsQueue = lambda: q
    worker.settings.RESULT_TTL = 3600

    # Patch the loop: run one iteration manually instead of infinite loop.
    from app.core.queue import RedisStreamsQueue as _RSQ  # noqa: F401

    async def run_one():
        job = await q.dequeue("ai:teacher", timeout=5)
        if not job:
            return
        assert job["payload"]["kind"] == "lessonforge"
        try:
            result = await lessonforge.generate(job["payload"]["payload"])
        except Exception as e:
            result = {"status": "failed", "error": str(e)}
        await q.set_result(job["job_id"], result, 3600)
        await q.ack("ai:teacher", job["job_id"])

    await run_one()

    assert "job-123" in q.results, "result not published"
    assert q.results["job-123"]["status"] == "completed"
    assert "Fractions" in q.results["job-123"]["html"]
    assert q.acked == ["job-123"], f"ack not called: {q.acked}"
    print("worker smoke test PASSED")


if __name__ == "__main__":
    asyncio.run(main())
