import logging
import asyncio
from functools import lru_cache
from typing import List, Optional

from groq import AsyncGroq

from app.config import settings
from app.models.schemas import (
    QueryResponse,
    SummarizeResponse,
    SourceChunk,
)
from app.services.document_service import get_document_service

logger = logging.getLogger(__name__)

# ─── Async Groq client — non-blocking IO ─────────────────────────────────────
client = AsyncGroq(api_key=settings.GROQ_API_KEY)

# ─── Prompts ──────────────────────────────────────────────────────────────────

# FIX 3: Replaced all "policy documents" references with "retrieved knowledge
# base" so the LLM does not discard URL chunks (which are retrieved just like
# PDF chunks but were being ignored because the prompt implied only PDFs matter).
SYSTEM_PROMPT = """
You are TNEB PolicyAI, an intelligent assistant for Tamil Nadu Electricity Board (TNEB) employees.

Your primary source of truth is the retrieved knowledge base excerpts, which may
include policy documents, official web pages, circulars, and reference material.

You are not merely a document lookup tool. You are expected to analyze,
synthesize, and explain information using the provided excerpts.

RULES

1. Use the retrieved excerpts as the primary evidence.
2. If the answer is explicitly stated in the excerpts, answer directly.
3. If the answer is not explicitly stated but can be reasonably inferred
   from one or more provisions, provide the inference.
4. You may combine information from multiple excerpts and multiple sources.
5. Clearly distinguish between:
   - Direct Statement (from source)
   - Inference (reasoned from source)
6. Do not invent facts unsupported by the excerpts.
7. For "why", "compare", "difference", "purpose", "advantage",
   "disadvantage", "impact", "evaluate", "analyze", and "explain"
   questions, infer the most reasonable explanation from the excerpts
   when explicit wording is unavailable.
8. Never refuse merely because the exact sentence is not present.
9. Only respond with:

"This information is not available in the current knowledge base."

when neither direct evidence nor reasonable inference exists.

CRITICAL — OUTPUT FORMAT

- NEVER narrate your reasoning process. Do not write "STEP 1", "STEP 2",
  "Let's follow the steps", "Since the answer is not directly stated, we
  proceed to...", or any other meta-commentary about how you are arriving
  at the answer.
- Do not restate or rephrase the question back to the user.
- Go straight to the answer. The internal reasoning steps you follow are
  for your own use only — the user must never see them.
- Open directly with the answer itself (a direct statement, or a short
  framing sentence at most one line long).

PARAGRAPH AND LENGTH RULES — STRICTLY ENFORCED

- NEVER write a paragraph longer than 3 sentences. If a point needs more
  than 3 sentences, break it into multiple short paragraphs or convert it
  into bullet points instead.
- Default to bullet points whenever you are listing more than one
  provision, mechanism, condition, category, or comparison point. Do not
  fold multiple distinct points into one flowing paragraph — give each
  point its own line.
- Insert a blank line between every paragraph and between every bullet
  group so the answer is visually broken into short, scannable chunks.
  Never produce one continuous block of text.
- Use clear section headers (e.g. "Direct Statement", "Inference")
  whenever the answer has more than one distinct part. For short,
  single-point answers, skip headers.
- A good answer looks like several short paragraphs and/or bullet
  groups, each 1-3 sentences, not one dense block.
- Cite the supporting excerpt naturally inline, e.g. "(Excerpt 2)" —
  do not create a separate "which excerpts support this" section.
- Do not pad with summary paragraphs that repeat what was already said.

ANSWER STYLE

- Be professional, direct, and concise.
- Prefer complete, well-reasoned explanations over one-line responses —
  but every sentence should add new information, not restate the process.
- When the question is analytical (why/compare/impact/etc.), present the
  reasoning as a normal explanatory answer broken into short paragraphs
  or bullets — never as one long paragraph and never as a labeled
  step-by-step procedure.
"""

# FIX 3 (continued): Changed "TNEB policy documents" → "retrieved excerpts"
# in both prompt templates so the LLM doesn't dismiss URL-sourced answers.
QA_PROMPT_TEMPLATE = """
The following are relevant excerpts from the TNEB knowledge base
(may include policy documents, official web content, circulars, etc.):

{context}

--------------------------------------------------

Employee Question:
{query}

Before answering, silently work through this checklist — do NOT show it
or reference it in your reply, it is only to guide your own reasoning:

- Is the answer directly stated in the excerpts? If so, answer using
  those provisions directly.
- If not directly stated, can a reasonable answer be inferred from one
  or more excerpts? If so, provide that inference, labeled
  "Inference" only if the answer is not a direct statement.
- You may combine information from multiple excerpts and multiple sources.
- Only say information is unavailable if neither a direct answer nor a
  reasonable inference can be made from ANY of the excerpts provided.

Now write the final answer only. Start directly with the substance —
no restated question, no description of your process, no step labels.

Format it as short paragraphs (max 3 sentences each) and/or bullet
points, with a blank line between each one. Do not write one long
continuous paragraph.
"""

SEARCH_PROMPT_TEMPLATE = """The following are excerpts from the TNEB knowledge base related to the search query:

{context}

---------------------------------

Search Query:
{query}

List all relevant rules, sections, and information found.
Format the answer as a structured list."""

SUMMARY_PROMPTS = {
    "brief": "Provide a concise 3-5 sentence summary of this document.",
    "detailed": """Provide a comprehensive summary covering:
1. Purpose
2. Key Rules
3. Employee Entitlements
4. Procedures
5. Important Limits and Deadlines""",
    "bullets": "Summarize the document using bullet points. Organize into sections with headings.",
}

# ─── Follow-up detection ──────────────────────────────────────────────────────

FOLLOWUP_TRIGGERS = [
    "explain", "elaborate", "tell me more", "what does that mean",
    "can you detail", "expand", "clarify", "why", "how so",
    "what about", "go on", "continue", "more detail", "in detail",
    "further", "deeper", "more", "again", "repeat", "rephrase",
    "what do you mean", "example", "give example", "instance",
]
ANALYTICAL_KEYWORDS = [
    "why",
    "purpose",
    "reason",
    "rationale",
    "compare",
    "comparison",
    "difference",
    "advantage",
    "advantages",
    "disadvantage",
    "disadvantages",
    "benefit",
    "benefits",
    "impact",
    "evaluate",
    "analysis",
    "analyze",
    "explain",
    "significance",
    "importance",
    "justify",
]


def _is_followup(query: str) -> bool:
    q = query.lower().strip()
    return len(query.split()) <= 8 or any(t in q for t in FOLLOWUP_TRIGGERS)


def _build_search_query(query: str, conversation_history: Optional[List[dict]]) -> str:
    if not _is_followup(query) or not conversation_history:
        return query

    last_assistant = next(
        (m.get("content", "") for m in reversed(conversation_history) if m.get("role") == "assistant"),
        None,
    )
    last_user = next(
        (m.get("content", "") for m in reversed(conversation_history) if m.get("role") == "user"),
        None,
    )

    parts = [query]
    if last_user:
        parts.append(last_user[:200])
    if last_assistant:
        parts.append(last_assistant[:400])

    enriched = " ".join(parts)
    logger.info("Follow-up detected — enriched query: %s...", enriched[:120])
    return enriched


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_context(chunks: List[SourceChunk]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        page_info = f", Page {chunk.page_number}" if chunk.page_number else ""
        parts.append(f"[Excerpt {i} — {chunk.document_name}{page_info}]\n{chunk.chunk_text}")
    return "\n\n---\n\n".join(parts)


def _build_chat_messages(conversation_history: Optional[List[dict]], user_prompt: str):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if conversation_history:
        for turn in conversation_history[-6:]:
            role = turn.get("role")
            if role in ("user", "assistant"):
                messages.append({"role": role, "content": turn.get("content", "")})
    messages.append({"role": "user", "content": user_prompt})
    return messages


# ─── Core async functions ─────────────────────────────────────────────────────

async def answer_query(
    query: str,
    mode: str = "qa",
    document_ids: Optional[List[str]] = None,
    conversation_history: Optional[List[dict]] = None,
) -> QueryResponse:

    doc_service = get_document_service()

    search_query = _build_search_query(query, conversation_history)

    chunks = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: doc_service.retrieve_chunks(
            query=search_query,
            top_k=settings.TOP_K_RESULTS,
            document_ids=document_ids,
        ),
    )

    if not chunks:
        return QueryResponse(
            answer="No relevant information found. Please upload documents or add URLs first, or refine your query.",
            sources=[],
            query=query,
            mode=mode,
        )

    context = _build_context(chunks)
    template = SEARCH_PROMPT_TEMPLATE if mode == "search" else QA_PROMPT_TEMPLATE
    user_prompt = template.format(
        context=context,
        query=query,
    )

    is_analytical = any(
        keyword in query.lower()
        for keyword in ANALYTICAL_KEYWORDS
    )

    if is_analytical:
        user_prompt += """

This is an analytical question. The answer may require combining multiple
excerpts. Do not refuse simply because the exact wording is not present —
reason from the excerpts and present the conclusion as a normal explanatory
answer. If the conclusion is inferred rather than explicitly stated, label
that part "Inference". Do not describe your reasoning process or use step labels.
"""

    messages = _build_chat_messages(conversation_history, user_prompt)

    logger.info("Calling Groq API async (mode=%s, chunks=%d, follow_up=%s)",
                mode, len(chunks), search_query != query)

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=0.2,
        max_tokens=1024,
    )

    answer = response.choices[0].message.content
    tokens = None
    try:
        if response.usage:
            tokens = response.usage.prompt_tokens + response.usage.completion_tokens
    except Exception:
        pass

    return QueryResponse(
        answer=answer,
        sources=chunks,
        query=query,
        mode=mode,
        tokens_used=tokens,
    )


async def summarize_document(
    document_id: str,
    summary_type: str = "brief",
) -> SummarizeResponse:

    doc_service = get_document_service()
    doc_info = doc_service.get_document(document_id)
    if not doc_info:
        raise ValueError(f"Document {document_id} not found")

    chunks = doc_service.get_all_chunks_for_doc(document_id)
    if not chunks:
        raise ValueError("No content found for this document")

    selected_chunks = chunks[:60]
    full_text = "\n\n".join(selected_chunks)
    summary_instruction = SUMMARY_PROMPTS.get(summary_type, SUMMARY_PROMPTS["brief"])

    prompt = f"{summary_instruction}\n\nDocument: {doc_info.original_name}\n\nContent:\n\n{full_text}"

    logger.info("Summarizing %s (%s), chunks=%d", doc_info.original_name, summary_type, len(selected_chunks))

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    return SummarizeResponse(
        document_name=doc_info.original_name,
        summary=response.choices[0].message.content,
        summary_type=summary_type,
        chunks_processed=len(selected_chunks),
    )