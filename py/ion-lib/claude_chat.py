# -*- coding: utf-8 -*-
"""
claude_chat — Claude (Anthropic Messages API) for the python tools, on the fastest model.

Every prompt in py/openai and friends used to go to OpenAI. They now go to Claude through
this module, which keeps the two call shapes those scripts already use so the prompts,
retries and JSON parsing around them did not have to be rewritten:

    from claude_chat import Claude as OpenAI, APITimeoutError

    client = OpenAI()                                   # api key from ANTHROPIC_API_KEY
    r = client.chat.completions.create(model=..., messages=[...], temperature=0.2,
                                       response_format={"type": "json_object"})
    r.choices[0].message.content

    r = client.responses.create(model=..., instructions=..., input=..., text={...})
    r.output_text

Model routing
    The fastest Claude model, claude-haiku-4-5, is used for every call. A script's own
    model string is honoured only if it already names a Claude model (claude-...); any
    other value (gpt-*, o3-*, ...) is routed to the fast model. Override with the
    CLAUDE_FAST_MODEL environment variable.

Transport
    Plain HTTPS with `requests` against https://api.anthropic.com/v1/messages, the same
    way py/sequence/extract-entities-file.py and the other Claude tools do it; the
    Anthropic SDK is not installed on the server's python.

Mapping notes
    - OpenAI 'system' / 'developer' messages become the request's `system` text.
    - response_format {"type": "json_object"} adds a JSON-only instruction and the reply
      is trimmed to the outermost JSON value.
    - response_format {"type": "json_schema", "json_schema": {...}} and the Responses
      API's text={"format": {"type": "json_schema", ...}} become
      output_config.format (structured outputs), so the text IS valid JSON.
    - OpenAI function tools become Anthropic tools; tool_use blocks come back as
      message.tool_calls[i].function.arguments (a JSON string), as before.
    - temperature/top_p pass through (clamped to 0..1); seed, n, logprobs, stream and
      other OpenAI-only options are ignored. stream=True returns a one-chunk iterator.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any, Dict, Iterator, List, Optional, Tuple

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
FAST_MODEL = os.environ.get("CLAUDE_FAST_MODEL") or "claude-haiku-4-5"
DEFAULT_MAX_TOKENS = 4096
MAX_OUTPUT_TOKENS = 32000
JSON_ONLY = "Respond with a single valid JSON value and nothing else: no prose, no markdown fences."


# ---------------------------------------------------------------- exceptions

class APIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.body = body


class APIConnectionError(APIError):
    pass


class APITimeoutError(APIConnectionError):
    pass


class RateLimitError(APIError):
    pass


class AuthenticationError(APIError):
    pass


class BadRequestError(APIError):
    pass


OpenAIError = APIError  # some scripts catch this name


# ---------------------------------------------------------------- helpers

def resolve_model(model: Optional[str]) -> str:
    m = ("" + (model or "")).strip()
    if m.startswith("claude-"):
        return m
    return FAST_MODEL


def _feature_name() -> str:
    try:
        return os.path.splitext(os.path.basename(sys.argv[0] or ""))[0] or "claude"
    except Exception:
        return "claude"


def _clamp01(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except Exception:
        return None
    return max(0.0, min(1.0, f))


def _extract_json_text(text: str) -> str:
    """Return the outermost JSON object/array in `text`, or the text stripped of fences."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t).strip()
    try:
        json.loads(t)
        return t
    except Exception:
        pass
    starts = [i for i in (t.find("{"), t.find("[")) if i >= 0]
    if not starts:
        return t
    i = min(starts)
    closer = "}" if t[i] == "{" else "]"
    j = t.rfind(closer)
    if j > i:
        cand = t[i:j + 1]
        try:
            json.loads(cand)
            return cand
        except Exception:
            return cand
    return t


def _content_to_blocks(content: Any) -> List[Dict[str, Any]]:
    """OpenAI message content (str or parts) -> Anthropic content blocks."""
    if content is None:
        return []
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []
    blocks: List[Dict[str, Any]] = []
    if isinstance(content, dict):
        content = [content]
    for part in content or []:
        if isinstance(part, str):
            blocks.append({"type": "text", "text": part})
            continue
        if not isinstance(part, dict):
            continue
        ptype = part.get("type")
        if ptype in ("text", "input_text", "output_text"):
            blocks.append({"type": "text", "text": "" + (part.get("text") or "")})
        elif ptype in ("image_url", "input_image"):
            url = part.get("image_url")
            if isinstance(url, dict):
                url = url.get("url")
            url = url or part.get("url") or ""
            m = re.match(r"^data:([^;]+);base64,(.*)$", "" + url, re.S)
            if m:
                blocks.append({"type": "image", "source": {"type": "base64", "media_type": m.group(1), "data": m.group(2)}})
            elif url:
                blocks.append({"type": "image", "source": {"type": "url", "url": url}})
        elif ptype == "text_block" or "text" in part:
            blocks.append({"type": "text", "text": "" + (part.get("text") or "")})
    return blocks


def _convert_messages(messages: Any, extra_system: Optional[str] = None) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """OpenAI-style role messages -> (system text, Anthropic messages)."""
    system_parts: List[str] = []
    out: List[Dict[str, Any]] = []
    if isinstance(messages, str):
        messages = [{"role": "user", "content": messages}]
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = (m.get("role") or "user").lower()
        content = m.get("content")
        if role in ("system", "developer"):
            if isinstance(content, str):
                system_parts.append(content)
            else:
                system_parts.append("".join(b.get("text", "") for b in _content_to_blocks(content) if b.get("type") == "text"))
            continue
        if role == "tool":
            out.append({"role": "user", "content": [{
                "type": "tool_result",
                "tool_use_id": m.get("tool_call_id") or "call_0",
                "content": "" + (content if isinstance(content, str) else json.dumps(content)),
            }]})
            continue
        if role == "assistant":
            blocks = _content_to_blocks(content)
            for tc in m.get("tool_calls") or []:
                fn = (tc or {}).get("function") or {}
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    args = {"_raw": fn.get("arguments")}
                blocks.append({"type": "tool_use", "id": tc.get("id") or "call_0", "name": fn.get("name") or "tool", "input": args})
            if blocks:
                out.append({"role": "assistant", "content": blocks})
            continue
        blocks = _content_to_blocks(content)
        if blocks:
            out.append({"role": "user", "content": blocks})
    if extra_system:
        system_parts.append(extra_system)
    # Anthropic requires alternating roles starting with user; merge neighbours.
    merged: List[Dict[str, Any]] = []
    for m in out:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] = list(merged[-1]["content"]) + list(m["content"])
        else:
            merged.append({"role": m["role"], "content": list(m["content"])})
    if not merged or merged[0]["role"] != "user":
        merged.insert(0, {"role": "user", "content": [{"type": "text", "text": "(no input)"}]})
    system = "\n\n".join(p for p in system_parts if p) or None
    return system, merged


def _convert_tools(tools: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for t in tools or []:
        if not isinstance(t, dict):
            continue
        fn = t.get("function") if t.get("type") == "function" else t
        if not isinstance(fn, dict) or not fn.get("name"):
            continue
        out.append({
            "name": fn["name"],
            "description": fn.get("description") or "",
            "input_schema": fn.get("parameters") or {"type": "object", "properties": {}},
        })
    return out


def _convert_tool_choice(tc: Any) -> Optional[Dict[str, Any]]:
    if tc is None:
        return None
    if isinstance(tc, str):
        return {"auto": {"type": "auto"}, "required": {"type": "any"}, "none": None}.get(tc, {"type": "auto"})
    if isinstance(tc, dict):
        fn = tc.get("function") or {}
        if fn.get("name"):
            return {"type": "tool", "name": fn["name"]}
    return {"type": "auto"}


# ---------------------------------------------------------------- result objects

class _Obj:
    """Attribute + dict style access, with .to_dict()/.model_dump() like the SDK objects."""

    def __init__(self, **kw: Any):
        for k, v in kw.items():
            setattr(self, k, v)

    def to_dict(self) -> Dict[str, Any]:
        def conv(v: Any) -> Any:
            if isinstance(v, _Obj):
                return v.to_dict()
            if isinstance(v, list):
                return [conv(x) for x in v]
            return v
        return {k: conv(v) for k, v in self.__dict__.items()}

    model_dump = to_dict

    def __getitem__(self, k: str) -> Any:
        return getattr(self, k)

    def get(self, k: str, default: Any = None) -> Any:
        return getattr(self, k, default)

    def __repr__(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)[:400]


class _Usage(_Obj):
    pass


def _usage(data: Dict[str, Any]) -> _Usage:
    u = data.get("usage") or {}
    pi = int(u.get("input_tokens") or 0)
    po = int(u.get("output_tokens") or 0)
    return _Usage(prompt_tokens=pi, completion_tokens=po, total_tokens=pi + po,
                  input_tokens=pi, output_tokens=po)


# ---------------------------------------------------------------- transport

class _Transport:
    def __init__(self, api_key: Optional[str], timeout: float, max_retries: int):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.timeout = timeout
        self.max_retries = max(0, int(max_retries))

    def post(self, body: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key:
            raise AuthenticationError("ANTHROPIC_API_KEY is not set on the server")
        if requests is None:
            raise APIConnectionError("python 'requests' is not available on the server")
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
        }
        last: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                r = requests.post(API_URL, headers=headers, json=body, timeout=self.timeout)
            except requests.Timeout as e:  # type: ignore[attr-defined]
                last = APITimeoutError("Claude request timed out after %ss" % self.timeout)
            except Exception as e:
                last = APIConnectionError("Claude request failed: %s" % e)
            else:
                if r.status_code == 200:
                    return r.json()
                text = (r.text or "")[:400]
                if r.status_code == 429:
                    last = RateLimitError("anthropic 429: %s" % text, 429, text)
                elif r.status_code >= 500:
                    last = APIError("anthropic %s: %s" % (r.status_code, text), r.status_code, text)
                elif r.status_code in (401, 403):
                    raise AuthenticationError("anthropic %s: %s" % (r.status_code, text), r.status_code, text)
                else:
                    raise BadRequestError("anthropic %s: %s" % (r.status_code, text), r.status_code, text)
            if attempt < self.max_retries:
                time.sleep(min(8.0, 1.5 * (2 ** attempt)))
        assert last is not None
        raise last


def _meter() -> None:
    try:
        import claude_usage as _cu  # type: ignore
        _cu.bump(_feature_name())
    except Exception:
        pass


def _build_body(*, model: str, system: Optional[str], messages: List[Dict[str, Any]],
                temperature: Any = None, top_p: Any = None, max_tokens: Any = None,
                tools: Any = None, tool_choice: Any = None, json_schema: Any = None,
                stop: Any = None) -> Dict[str, Any]:
    try:
        mt = int(max_tokens) if max_tokens is not None else DEFAULT_MAX_TOKENS
    except Exception:
        mt = DEFAULT_MAX_TOKENS
    body: Dict[str, Any] = {
        "model": resolve_model(model),
        "max_tokens": max(64, min(MAX_OUTPUT_TOKENS, mt)),
        "messages": messages,
    }
    if system:
        body["system"] = system
    t = _clamp01(temperature)
    if t is not None:
        body["temperature"] = t
    tp = _clamp01(top_p)
    if tp is not None and t is None:
        body["top_p"] = tp
    if stop:
        body["stop_sequences"] = [stop] if isinstance(stop, str) else list(stop)[:4]
    ctools = _convert_tools(tools)
    if ctools:
        body["tools"] = ctools
        tc = _convert_tool_choice(tool_choice)
        if tc:
            body["tool_choice"] = tc
    if json_schema:
        body["output_config"] = {"format": {"type": "json_schema", "schema": json_schema}}
    return body


def _text_of(data: Dict[str, Any]) -> str:
    return "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text")


def _tool_calls_of(data: Dict[str, Any]) -> List[_Obj]:
    calls: List[_Obj] = []
    for b in data.get("content") or []:
        if b.get("type") == "tool_use":
            calls.append(_Obj(
                id=b.get("id") or "call_0",
                type="function",
                function=_Obj(name=b.get("name") or "", arguments=json.dumps(b.get("input") or {}, ensure_ascii=False)),
            ))
    return calls


def _check_refusal(data: Dict[str, Any]) -> None:
    if data.get("stop_reason") == "refusal":
        det = data.get("stop_details") or {}
        raise APIError("the model declined this request" + (" (%s)" % det.get("category") if det.get("category") else ""))


def _json_schema_from_response_format(rf: Any) -> Tuple[Optional[Dict[str, Any]], bool]:
    """-> (schema or None, json_object_mode)"""
    if not isinstance(rf, dict):
        return None, False
    t = rf.get("type")
    if t == "json_object":
        return None, True
    if t == "json_schema":
        js = rf.get("json_schema") or {}
        schema = js.get("schema") if isinstance(js, dict) else None
        if schema is None and isinstance(rf.get("schema"), dict):
            schema = rf.get("schema")
        return (schema or None), (schema is None)
    return None, False


# ---------------------------------------------------------------- client

class _Completions:
    def __init__(self, transport: _Transport):
        self._t = transport

    def create(self, *, model: Optional[str] = None, messages: Any = None, temperature: Any = None,
               top_p: Any = None, max_tokens: Any = None, max_completion_tokens: Any = None,
               response_format: Any = None, tools: Any = None, tool_choice: Any = None,
               stop: Any = None, stream: bool = False, **_ignored: Any) -> Any:
        schema, json_mode = _json_schema_from_response_format(response_format)
        system, msgs = _convert_messages(messages, JSON_ONLY if json_mode else None)
        body = _build_body(model=model or "", system=system, messages=msgs, temperature=temperature,
                           top_p=top_p, max_tokens=max_completion_tokens or max_tokens,
                           tools=tools, tool_choice=tool_choice, json_schema=schema, stop=stop)
        _meter()
        data = self._t.post(body)
        _check_refusal(data)
        text = _text_of(data)
        if json_mode:
            text = _extract_json_text(text)
        calls = _tool_calls_of(data)
        message = _Obj(role="assistant", content=(text if text or not calls else None),
                       tool_calls=(calls or None), refusal=None)
        finish = {"end_turn": "stop", "max_tokens": "length", "tool_use": "tool_calls",
                  "stop_sequence": "stop"}.get(data.get("stop_reason") or "", "stop")
        choice = _Obj(index=0, message=message, finish_reason=finish)
        completion = _Obj(id=data.get("id") or "", object="chat.completion", model=data.get("model") or body["model"],
                          created=int(time.time()), choices=[choice], usage=_usage(data))
        if stream:
            return _stream_once(completion)
        return completion


def _stream_once(completion: Any) -> Iterator[Any]:
    msg = completion.choices[0].message
    delta = _Obj(role="assistant", content=msg.content, tool_calls=msg.tool_calls)
    yield _Obj(id=completion.id, object="chat.completion.chunk", model=completion.model,
               choices=[_Obj(index=0, delta=delta, finish_reason=completion.choices[0].finish_reason)])


class _Chat:
    def __init__(self, transport: _Transport):
        self.completions = _Completions(transport)


class _Responses:
    def __init__(self, transport: _Transport):
        self._t = transport

    def create(self, *, model: Optional[str] = None, input: Any = None, instructions: Optional[str] = None,
               temperature: Any = None, top_p: Any = None, max_output_tokens: Any = None,
               text: Any = None, tools: Any = None, tool_choice: Any = None, **_ignored: Any) -> Any:
        schema: Optional[Dict[str, Any]] = None
        json_mode = False
        if isinstance(text, dict):
            fmt = text.get("format") or {}
            if isinstance(fmt, dict):
                if fmt.get("type") == "json_schema" and isinstance(fmt.get("schema"), dict):
                    schema = fmt["schema"]
                elif fmt.get("type") == "json_object":
                    json_mode = True
        if isinstance(input, str):
            messages: Any = [{"role": "user", "content": input}]
        else:
            messages = input
        system, msgs = _convert_messages(messages, JSON_ONLY if json_mode else None)
        if instructions:
            system = (instructions + ("\n\n" + system if system else ""))
        body = _build_body(model=model or "", system=system, messages=msgs, temperature=temperature,
                           top_p=top_p, max_tokens=max_output_tokens, tools=tools, tool_choice=tool_choice,
                           json_schema=schema)
        _meter()
        data = self._t.post(body)
        _check_refusal(data)
        out_text = _text_of(data)
        if json_mode:
            out_text = _extract_json_text(out_text)
        output = [_Obj(type="message", role="assistant", id=data.get("id") or "",
                       content=[_Obj(type="output_text", text=out_text)])]
        for c in _tool_calls_of(data):
            output.append(_Obj(type="function_call", id=c.id, call_id=c.id, name=c.function.name,
                               arguments=c.function.arguments))
        return _Obj(id=data.get("id") or "", object="response", model=data.get("model") or body["model"],
                    output_text=out_text, output=output, usage=_usage(data),
                    status="completed", created_at=int(time.time()))


class Claude:
    """Claude client with the chat.completions / responses call shapes the tools use."""

    def __init__(self, api_key: Optional[str] = None, timeout: Any = 120, max_retries: Any = 2, **_ignored: Any):
        try:
            to = float(timeout) if timeout is not None else 120.0
        except Exception:
            to = 120.0
        try:
            mr = int(max_retries) if max_retries is not None else 2
        except Exception:
            mr = 2
        self._transport = _Transport(api_key, to, mr)
        self.chat = _Chat(self._transport)
        self.responses = _Responses(self._transport)
        self.model = FAST_MODEL

    def with_options(self, timeout: Any = None, max_retries: Any = None, **_ignored: Any) -> "Claude":
        return Claude(self._transport.api_key,
                      timeout if timeout is not None else self._transport.timeout,
                      max_retries if max_retries is not None else self._transport.max_retries)


OpenAI = Claude  # the name the migrated scripts import it under

__all__ = ["Claude", "OpenAI", "FAST_MODEL", "resolve_model", "APIError", "APIConnectionError",
           "APITimeoutError", "RateLimitError", "AuthenticationError", "BadRequestError", "OpenAIError"]
