"""Thin wrapper over toki's OpenRouter backend: one call, one strict-schema tool,
validated into a pydantic model. Retries once with the validation error."""
from __future__ import annotations

import asyncio
import hashlib
import json
from typing import TypeVar

from pydantic import BaseModel, ValidationError
from toki import OpenRouterModel, TokiToolsResponse

from . import config

T = TypeVar("T", bound=BaseModel)


def prompt_version(name: str) -> str:
    """Short hash of the prompt file so analyses record what produced them."""
    text = (config.PROMPTS_DIR / f"{name}.md").read_text()
    return hashlib.sha256(text.encode()).hexdigest()[:10]


def load_prompt(name: str) -> str:
    return (config.PROMPTS_DIR / f"{name}.md").read_text()


def _submit_tool(schema_model: type[BaseModel]) -> dict:
    schema = schema_model.model_json_schema()
    # OpenAI-style strict schemas want additionalProperties: false everywhere.
    _strictify(schema)
    return {
        "type": "function",
        "function": {
            "name": "submit",
            "description": "Submit the completed analysis. Call exactly once.",
            "parameters": schema,
            "strict": True,
        },
    }


def _strictify(node):
    if isinstance(node, dict):
        if node.get("type") == "object" and "properties" in node:
            node.setdefault("additionalProperties", False)
            node["required"] = list(node["properties"].keys())
        for v in node.values():
            _strictify(v)
    elif isinstance(node, list):
        for v in node:
            _strictify(v)


def _unwrap_json_strings(node):
    """Some models emit nested objects as JSON strings; decode them so validation sees dicts/lists."""
    if isinstance(node, dict):
        return {k: _unwrap_json_strings(v) for k, v in node.items()}
    if isinstance(node, list):
        return [_unwrap_json_strings(v) for v in node]
    if isinstance(node, str):
        t = node.strip()
        if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
            try:
                return _unwrap_json_strings(json.loads(t))
            except json.JSONDecodeError:
                return node
    return node


def structured_call(model_id: str, system: str, user: str, out: type[T], *, reasoning_effort: str | None = None) -> T:
    model = OpenRouterModel(model_id, api_key=config.openrouter_api_key(), reasoning_effort=reasoning_effort)  # type: ignore[arg-type]
    tool = _submit_tool(out)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last_err: Exception | None = None
    for attempt in range(2):
        resp = model.complete(messages, tools=[tool], tool_choice={"type": "function", "function": {"name": "submit"}})
        if not isinstance(resp, TokiToolsResponse) or not resp.tool_calls:
            last_err = RuntimeError(f"model returned no tool call: {str(resp)[:300]}")
        else:
            args = resp.tool_calls[0].function.arguments
            if isinstance(args, str):
                args = json.loads(args)
            try:
                return out.model_validate(_unwrap_json_strings(args))
            except ValidationError as e:
                last_err = e
        # feed the error back once
        messages.append({"role": "assistant", "content": f"(previous attempt was invalid: {last_err})"})
        messages.append({"role": "user", "content": "Call `submit` again with a valid payload."})
    raise RuntimeError(f"{model_id} failed to produce valid output: {last_err}")


async def astructured_call(model_id: str, system: str, user: str, out: type[T], *, reasoning_effort: str | None = None) -> T:
    """Async twin of structured_call, for fan-out over many independent prompts."""
    model = OpenRouterModel(model_id, api_key=config.openrouter_api_key(), reasoning_effort=reasoning_effort)  # type: ignore[arg-type]
    tool = _submit_tool(out)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last_err: Exception | None = None
    for attempt in range(2):
        resp = await model.acomplete(messages, tools=[tool], tool_choice={"type": "function", "function": {"name": "submit"}})
        if not isinstance(resp, TokiToolsResponse) or not resp.tool_calls:
            last_err = RuntimeError(f"model returned no tool call: {str(resp)[:300]}")
        else:
            args = resp.tool_calls[0].function.arguments
            if isinstance(args, str):
                args = json.loads(args)
            try:
                return out.model_validate(_unwrap_json_strings(args))
            except ValidationError as e:
                last_err = e
        messages.append({"role": "assistant", "content": f"(previous attempt was invalid: {last_err})"})
        messages.append({"role": "user", "content": "Call `submit` again with a valid payload."})
    raise RuntimeError(f"{model_id} failed to produce valid output: {last_err}")


def run_many(calls, concurrency: int = 8):
    """Run a list of zero-arg coroutine factories with bounded concurrency; returns results or exceptions in order."""
    async def go():
        sem = asyncio.Semaphore(concurrency)
        async def one(f):
            async with sem:
                try:
                    return await f()
                except Exception as e:  # keep the batch going; caller decides
                    return e
        return await asyncio.gather(*(one(f) for f in calls))
    return asyncio.run(go())
