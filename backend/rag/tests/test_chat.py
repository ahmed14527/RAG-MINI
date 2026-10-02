import json
from unittest import mock

from channels.testing import WebsocketCommunicator
from django.test import AsyncClient
from rest_framework_simplejwt.tokens import RefreshToken

from project.asgi import application
from rag import pipeline
from rag.errors import LLMError

from .utils import RAGTestCase, User, pdf_upload


class ChatTests(RAGTestCase):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload().json()["data"]["id"]
        complete = mock.patch("rag.helpers.llm.complete", return_value="Refunds are allowed within 30 days [1].")
        self.complete = complete.start()
        self.addCleanup(complete.stop)

    def chat(self, message, client=None, **extra):
        return (client or self.client).post("/api/v1/chat/", {"message": message, **extra}, format="json")

    def test_answer_includes_sources_with_page_and_citation(self):
        response = self.chat("What is the refund policy?")

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["answer"], "Refunds are allowed within 30 days [1].")
        self.assertTrue(data["grounded"])
        top = data["sources"][0]
        self.assertEqual((top["id"], top["document"], top["page"], top["cited"]), (1, "policy.pdf", 1, True))
        self.assertEqual(top["chunk_id"], f"doc{self.doc_id}-chunk0")
        self.assertIn("Refunds", top["snippet"])
        self.assertGreaterEqual(data["retrieval"]["used"], 1)

    def test_prompt_contains_rules_numbered_context_and_history(self):
        history = [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello!"}]
        self.chat("What is the refund policy?", history=history)

        messages = self.complete.call_args.args[0]
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("ONLY from the numbered context", messages[0]["content"])
        self.assertEqual(messages[1:3], history)
        self.assertIn("[1] (policy.pdf, page 1)\nRefunds are allowed", messages[-1]["content"])
        self.assertTrue(messages[-1]["content"].endswith("Question: What is the refund policy?"))

    def test_no_relevant_context_answers_without_llm(self):
        response = self.chat("Who won the football world cup?")

        data = response.json()["data"]
        self.assertEqual(data["answer"], pipeline.NO_CONTEXT_ANSWER)
        self.assertFalse(data["grounded"])
        self.assertEqual(data["sources"], [])
        self.complete.assert_not_called()

    def test_users_cannot_retrieve_each_others_documents(self):
        bob = self.client_for(User.objects.create_user("bob", "bob@example.com", "Zq8#mLw2vTp9"))
        response = self.chat("What is the refund policy?", client=bob)

        self.assertEqual(response.json()["data"]["answer"], pipeline.NO_DOCUMENTS_ANSWER)
        self.complete.assert_not_called()

    def test_document_filter(self):
        other = self.upload(pdf_upload("other.pdf", ["Refunds for gift cards are never allowed."])).json()["data"]["id"]

        sources = self.chat("refunds allowed", document_ids=[other]).json()["data"]["sources"]
        self.assertEqual({s["document_id"] for s in sources}, {other})

    def test_invalid_request(self):
        response = self.chat("")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid request")

    def test_llm_failure_returns_safe_error(self):
        self.complete.side_effect = LLMError("Could not reach the language model provider. Please try again.")
        response = self.chat("What is the refund policy?")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"], "Language model error")

    def test_unexpected_error_does_not_leak(self):
        self.complete.side_effect = RuntimeError("secret internals sk-123")
        with self.assertLogs("rag.errors", "ERROR"):
            response = self.chat("What is the refund policy?")

        self.assertEqual(response.status_code, 500)
        self.assertNotIn("sk-123", response.content.decode())


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


async def fake_stream(messages):
    for part in ["Refunds are allowed ", "within 30 days [1]."]:
        yield part


class StreamingTestCase(RAGTestCase):
    def setUp(self):
        super().setUp()
        self.upload()
        stream = mock.patch("rag.helpers.llm.stream_completion", side_effect=fake_stream)
        stream.start()
        self.addCleanup(stream.stop)
        self.token = str(RefreshToken.for_user(self.user).access_token)


class ChatStreamTests(StreamingTestCase):
    async def post_stream(self, message):
        response = await AsyncClient().post(
            "/api/v1/chat/stream/", {"message": message}, content_type="application/json",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200, getattr(response, "content", b""))
        body = b"".join([chunk async for chunk in response.streaming_content]).decode()
        return response, body

    async def test_stream_emits_sources_deltas_and_done(self):
        response, body = await self.post_stream("What is the refund policy?")

        self.assertEqual(response["Content-Type"], "text/event-stream")
        events = parse_sse(body)
        self.assertEqual([e for e, _ in events], ["sources", "delta", "delta", "done"])
        self.assertEqual(events[0][1]["sources"][0]["page"], 1)
        self.assertEqual("".join(d["text"] for e, d in events if e == "delta"), "Refunds are allowed within 30 days [1].")
        self.assertEqual(events[-1][1]["cited"], [1])

    async def test_stream_reports_llm_errors_as_event(self):
        async def failing(messages):
            raise LLMError("The language model provider returned an error.")
            yield  # pragma: no cover

        with mock.patch("rag.helpers.llm.stream_completion", side_effect=failing):
            _, body = await self.post_stream("What is the refund policy?")

        events = parse_sse(body)
        self.assertEqual(events[-1], ("error", {"error": "Language model error",
                                                 "details": "The language model provider returned an error."}))


class WebSocketTests(StreamingTestCase):
    async def test_websocket_requires_token(self):
        communicator = WebsocketCommunicator(application, "/api/v1/ws/chat/")
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4001)

    async def test_websocket_streams_answer_with_sources(self):
        communicator = WebsocketCommunicator(application, f"/api/v1/ws/chat/?token={self.token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        self.assertEqual((await communicator.receive_json_from())["type"], "welcome")

        await communicator.send_json_to({"query": "What is the refund policy?"})
        messages = [await communicator.receive_json_from(timeout=5) for _ in range(4)]
        await communicator.disconnect()

        self.assertEqual([m["type"] for m in messages], ["sources", "delta", "delta", "done"])
        self.assertEqual(messages[0]["sources"][0]["document"], "policy.pdf")
        self.assertEqual(messages[-1]["cited"], [1])
