import json
import logging
import aiohttp
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.conf import settings

from .helpers.vector_store import get_chroma_collection, embed_texts

logger = logging.getLogger(__name__)

# Constants
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_TOP_K = 3
DEFAULT_MODEL = "gpt-4o-mini"


# Global collection cache to reuse across requests
_collection = None


def get_collection():
    """Get or create ChromaDB collection for caching."""
    global _collection
    if _collection is None:
        _collection = get_chroma_collection()
    return _collection


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling real-time chat with PDF documents using RAG.
    """

    async def connect(self):
        """Handle WebSocket connection with JWT authentication."""
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            logger.info("WS connection rejected: anonymous user")
            await self.close(code=4001)
            return

        await self.accept()
        logger.info(f"WS accepted user_id={getattr(user, 'id', None)}")
        
        username = getattr(user, 'username', 'Unknown') if user else 'Unknown'
        welcome_message = {
            "type": "welcome",
            "message": f"Connected as {username}"
        }
        await self.send(text_data=json.dumps(welcome_message))

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        user_id = getattr(self.scope.get('user', None), 'id', None)
        logger.info(f"WS disconnect user={user_id} code={close_code}")

    async def receive(self, text_data=None, bytes_data=None):
        """Handle incoming WebSocket messages and process chat queries."""
        try:
            # Validate message content
            if not text_data:
                await self._send_error("Empty message", "No message content provided")
                return

            # Parse JSON payload
            try:
                payload = json.loads(text_data)
            except json.JSONDecodeError:
                await self._send_error("Invalid JSON", "Message must be valid JSON format")
                return

            # Extract and validate query parameters
            query = payload.get("query")
            top_k = int(payload.get("top_k", DEFAULT_TOP_K))

            if not query or not query.strip():
                await self._send_error("Missing query", "Field 'query' is required and cannot be empty")
                return

            # Process the query through RAG pipeline
            await self._process_query(query, top_k)

        except Exception as exc:
            logger.exception("Error in receive")
            await self._send_error("Internal server error", "An error occurred while processing your request")

    async def _process_query(self, query: str, top_k: int):
        """Process user query through the RAG pipeline."""
        # Step 1: Generate query embedding
        query_embeddings = await sync_to_async(embed_texts)([query])
        query_embedding = query_embeddings[0]

        # Step 2: Retrieve relevant documents from vector store
        collection = get_collection()
        results = await sync_to_async(collection.query)(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas"]
        )

        # Step 3: Extract documents and build context
        documents = results.get("documents", [[]])[0]
        if not documents:
            await self._send_error("No relevant context found", "No matching documents found in the knowledge base")
            return

        # Step 4: Build prompt with context
        context = "\n\n---\n\n".join(documents)
        prompt = self._build_prompt(context, query)

        # Step 5: Stream LLM response
        await self._stream_openai_response(prompt)

    def _build_prompt(self, context: str, query: str) -> str:
        """Build the prompt for the LLM with context and query."""
        return (
            "Answer using ONLY the provided context. "
            "If the answer is not in the context, respond 'I don't know.'\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {query}\n\n"
            f"Answer:"
        )

    async def _send_error(self, error: str, details: str):
        """Send error message to client."""
        error_message = {
            "error": error,
            "details": details
        }
        await self.send(text_data=json.dumps(error_message))

    async def _stream_openai_response(self, prompt: str):
        """
        Stream response from OpenAI API.
        
        Sends delta chunks as they arrive and a done message when complete.
        """
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": DEFAULT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(OPENAI_API_URL, headers=headers, json=payload, timeout=None) as response:
                    await self._handle_openai_response(response)
                    
        except Exception as exc:
            logger.exception("OpenAI streaming error")
            await self._send_error("Streaming error", "An error occurred while streaming the response")

    async def _handle_openai_response(self, response):
        """Handle streaming response from OpenAI API."""
        if response.status != 200:
            body = await response.text()
            logger.error(f"OpenAI stream failed: {response.status} {body}")
            await self._send_error("LLM service error", f"External AI service returned error {response.status}")
            return

        async for raw_chunk in response.content:
            if not raw_chunk:
                continue
                
            try:
                line = raw_chunk.decode("utf-8").strip()
            except Exception:
                continue

            await self._process_stream_chunk(line)

        # Send completion signal
        await self.send(text_data=json.dumps({"type": "done"}))

    async def _process_stream_chunk(self, line: str):
        """Process individual chunks from the OpenAI stream."""
        for part in line.splitlines():
            part = part.strip()
            if not part or not part.startswith("data: "):
                continue
                
            data_str = part[len("data: "):]
            if data_str == "[DONE]":
                await self.send(text_data=json.dumps({"type": "done"}))
                return
                
            try:
                chunk_data = json.loads(data_str)
                choices = chunk_data.get("choices", [])
                
                if choices:
                    delta = choices[0].get("delta", {}).get("content")
                    if delta is None:
                        delta = choices[0].get("text")
                        
                    if delta:
                        delta_message = {
                            "type": "delta",
                            "text": delta
                        }
                        await self.send(text_data=json.dumps(delta_message))
                        
            except json.JSONDecodeError:
                continue