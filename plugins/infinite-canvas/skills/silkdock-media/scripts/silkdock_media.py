#!/usr/bin/env python3
"""List SilkDock media models and generate images or videos."""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import time
from typing import Any
from urllib import error, parse, request

try:
    import tomllib
except ImportError:  # pragma: no cover - Python 3.11+ is expected.
    tomllib = None


DEFAULT_BASE_URL = "https://silkdock.ai/v1"
DEFAULT_IMAGE_MODEL = "gpt-image-2"
DEFAULT_VIDEO_MODEL = "wan-2.6"
DEFAULT_IMAGE_POLL_INTERVAL = 5.0
DEFAULT_VIDEO_POLL_INTERVAL = 10.0
FAILURE_STATES = {"cancelled", "canceled", "failed", "error", "expired"}
SUCCESS_STATES = {"completed", "complete", "succeeded", "success", "ready"}
RESERVED_PARAMS = {"model", "prompt"}
IMAGE_HINTS = ("image", "flux", "ideogram", "recraft", "seedream", "dall-e")
VIDEO_HINTS = ("video", "kling", "seedance", "sora", "veo", "wan", "runway", "hailuo")
MEDIA_KINDS = {"image", "video", "audio"}


class SilkDockError(RuntimeError):
    pass


def _default_auth_file() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    return Path(codex_home).expanduser() / "auth.json" if codex_home else Path.home() / ".codex" / "auth.json"


def _default_config_file() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    return Path(codex_home).expanduser() / "config.toml" if codex_home else Path.home() / ".codex" / "config.toml"


def _load_auth(path: Path) -> tuple[str, str | None]:
    try:
        auth = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SilkDockError(f"Codex credential file not found: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise SilkDockError(f"Cannot read Codex credential file: {path}: {exc}") from exc

    api_key = auth.get("OPENAI_API_KEY")
    if not isinstance(api_key, str) or not api_key.strip():
        raise SilkDockError(f"OPENAI_API_KEY is missing or empty in {path}")

    base_url = auth.get("OPENAI_BASE_URL")
    if base_url is not None and (not isinstance(base_url, str) or not base_url.strip()):
        raise SilkDockError(f"OPENAI_BASE_URL must be a non-empty string in {path}")

    try:
        if stat.S_IMODE(path.stat().st_mode) & 0o077:
            print(f"warning: {path} is readable by users other than its owner", file=sys.stderr)
    except OSError:
        pass

    return api_key.strip(), base_url.strip().rstrip("/") if base_url else None


def _load_config_base_url(path: Path) -> str | None:
    if not path.exists():
        return None
    if tomllib is None:
        raise SilkDockError("Reading config.toml requires Python 3.11 or newer")
    try:
        with path.open("rb") as config_file:
            config = tomllib.load(config_file)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise SilkDockError(f"Cannot read Codex config file: {path}: {exc}") from exc

    provider_id = config.get("model_provider")
    providers = config.get("model_providers")
    if isinstance(provider_id, str) and isinstance(providers, dict):
        provider = providers.get(provider_id)
        if isinstance(provider, dict):
            value = provider.get("base_url")
            if isinstance(value, str) and value.strip():
                return value.strip().rstrip("/")

    value = config.get("openai_base_url")
    return value.strip().rstrip("/") if isinstance(value, str) and value.strip() else None


def _validate_url(url: str, allow_insecure_http: bool) -> None:
    parsed = parse.urlparse(url)
    if parsed.scheme == "https" and parsed.netloc:
        return
    if allow_insecure_http and parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        return
    raise SilkDockError("URLs must use HTTPS; HTTP is allowed only for localhost with --allow-insecure-http")


def _safe_error(body: bytes, status: int) -> str:
    text = body.decode("utf-8", errors="replace")[:2000]
    try:
        parsed_body = json.loads(text)
        detail = parsed_body.get("error", parsed_body) if isinstance(parsed_body, dict) else parsed_body
        return f"HTTP {status}: {detail}"
    except json.JSONDecodeError:
        return f"HTTP {status}: {text or 'empty response'}"


def _http(
    method: str,
    url: str,
    api_key: str,
    payload: dict[str, Any] | None,
    timeout: float,
) -> tuple[bytes, str]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json, image/*, video/*, application/octet-stream",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "silkdock-media-skill/2.0",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return response.read(), response.headers.get_content_type()
    except error.HTTPError as exc:
        raise SilkDockError(_safe_error(exc.read(), exc.code)) from exc
    except error.URLError as exc:
        raise SilkDockError(f"Network request failed: {exc.reason}") from exc
    except TimeoutError as exc:
        raise SilkDockError("Network request timed out") from exc


def _request_json(
    method: str,
    url: str,
    api_key: str,
    payload: dict[str, Any] | None,
    timeout: float,
) -> dict[str, Any]:
    body, _ = _http(method, url, api_key, payload, timeout)
    try:
        result = json.loads(body)
    except json.JSONDecodeError as exc:
        raise SilkDockError("SilkDock returned non-JSON data") from exc
    if not isinstance(result, dict):
        raise SilkDockError("SilkDock returned an unexpected JSON structure")
    return result


def _encode_multipart(
    fields: dict[str, Any], file_fields: list[tuple[str, Path]]
) -> tuple[bytes, str]:
    boundary = f"----silkdock-media-{secrets.token_hex(16)}"
    body = bytearray()
    for key, value in fields.items():
        serialized = value if isinstance(value, str) else json.dumps(value, separators=(",", ":"))
        body.extend(f"--{boundary}\r\n".encode("ascii"))
        body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(serialized).encode("utf-8"))
        body.extend(b"\r\n")

    for field_name, media_path in file_fields:
        filename = media_path.name.replace('"', "_").replace("\r", "_").replace("\n", "_")
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        body.extend(f"--{boundary}\r\n".encode("ascii"))
        body.extend(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("ascii"))
        body.extend(media_path.read_bytes())
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("ascii"))
    return bytes(body), boundary


def _request_multipart_json(
    url: str,
    api_key: str,
    fields: dict[str, Any],
    file_fields: list[tuple[str, Path]],
    timeout: float,
) -> dict[str, Any]:
    body, boundary = _encode_multipart(fields, file_fields)
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "silkdock-media-skill/2.1",
    }
    req = request.Request(url, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=timeout) as response:
            response_body = response.read()
    except error.HTTPError as exc:
        raise SilkDockError(_safe_error(exc.read(), exc.code)) from exc
    except error.URLError as exc:
        raise SilkDockError(f"Network request failed: {exc.reason}") from exc
    except TimeoutError as exc:
        raise SilkDockError("Network request timed out") from exc

    try:
        result = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise SilkDockError("SilkDock returned non-JSON data") from exc
    if not isinstance(result, dict):
        raise SilkDockError("SilkDock returned an unexpected JSON structure")
    return result


def _download(url: str, timeout: float, allow_insecure_http: bool) -> bytes:
    _validate_url(url, allow_insecure_http)
    req = request.Request(url, headers={"User-Agent": "silkdock-media-skill/2.0"})
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return response.read()
    except error.HTTPError as exc:
        raise SilkDockError(f"Media download failed with HTTP {exc.code}") from exc
    except error.URLError as exc:
        raise SilkDockError(f"Media download failed: {exc.reason}") from exc


def _decode_data_url(value: str) -> bytes | None:
    if not value.startswith("data:") or ";base64," not in value:
        return None
    try:
        return base64.b64decode(value.split(";base64,", 1)[1], validate=True)
    except (ValueError, binascii.Error) as exc:
        raise SilkDockError("SilkDock returned an invalid base64 data URL") from exc


def _extract_media(value: Any, timeout: float, allow_insecure_http: bool) -> bytes | None:
    if isinstance(value, list):
        for item in value:
            media = _extract_media(item, timeout, allow_insecure_http)
            if media is not None:
                return media
        return None
    if not isinstance(value, dict):
        return None

    for key in ("b64_json", "b64_video", "base64", "content"):
        encoded = value.get(key)
        if isinstance(encoded, str) and encoded:
            decoded = _decode_data_url(encoded)
            if decoded is not None:
                return decoded
            try:
                return base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                pass

    for key in ("url", "download_url", "output_url", "video_url", "image_url"):
        url = value.get(key)
        if isinstance(url, str) and url:
            decoded = _decode_data_url(url)
            return decoded if decoded is not None else _download(url, timeout, allow_insecure_http)

    for key in ("data", "output", "result", "artifacts", "images", "videos"):
        media = _extract_media(value.get(key), timeout, allow_insecure_http)
        if media is not None:
            return media
    return None


def _job_id(result: dict[str, Any]) -> str | None:
    for key in ("id", "job_id", "task_id", "request_id"):
        value = result.get(key)
        if isinstance(value, str) and value:
            return value
    for key in ("data", "result"):
        nested = result.get(key)
        if isinstance(nested, dict):
            found = _job_id(nested)
            if found:
                return found
    return None


def _status(result: dict[str, Any]) -> str:
    for key in ("status", "state"):
        value = result.get(key)
        if isinstance(value, str):
            return value.lower()
    return ""


def _poll_url(result: dict[str, Any], base_url: str, media: str, job_id: str) -> str:
    for key in ("poll_url", "status_url"):
        value = result.get(key)
        if isinstance(value, str) and value:
            return value if parse.urlparse(value).scheme else f"{base_url}/{value.lstrip('/')}"
    quoted = parse.quote(job_id, safe="")
    return f"{base_url}/videos/{quoted}" if media == "video" else f"{base_url}/images/generations/{quoted}"


def _poll_delay(result: dict[str, Any], minimum: float) -> float:
    """Honor a longer server-provided delay without polling faster than configured."""
    candidates: list[float] = [minimum]
    for key, multiplier in (("retry_after", 1.0), ("poll_interval", 1.0), ("retry_after_ms", 0.001)):
        value = result.get(key)
        try:
            parsed_value = float(value) * multiplier
        except (TypeError, ValueError):
            continue
        if parsed_value > 0:
            candidates.append(parsed_value)
    return max(candidates)


def _validate_poll_interval(media: str, value: float) -> None:
    minimum = DEFAULT_IMAGE_POLL_INTERVAL if media == "image" else DEFAULT_VIDEO_POLL_INTERVAL
    if value < minimum:
        raise SilkDockError(f"--poll-interval for {media} must be at least {minimum:g} seconds")


def _wait_for_media(
    initial: dict[str, Any],
    base_url: str,
    media: str,
    api_key: str,
    poll_interval: float,
    total_timeout: float,
    request_timeout: float,
    allow_insecure_http: bool,
) -> tuple[bytes, int]:
    result = initial
    deadline = time.monotonic() + total_timeout
    job_id = _job_id(result)
    poll_count = 0

    while True:
        generated = _extract_media(result, request_timeout, allow_insecure_http)
        if generated is not None:
            return generated, poll_count

        status = _status(result)
        if status in FAILURE_STATES:
            detail = result.get("error") or result.get("message") or status
            raise SilkDockError(f"{media} generation {status}: {detail}")

        if status in SUCCESS_STATES and media == "video" and job_id:
            content_url = f"{base_url}/videos/{parse.quote(job_id, safe='')}/content"
            body, content_type = _http("GET", content_url, api_key, None, request_timeout)
            if content_type != "application/json":
                return body, poll_count
            try:
                content_result = json.loads(body)
            except json.JSONDecodeError as exc:
                raise SilkDockError("Video content endpoint returned invalid data") from exc
            generated = _extract_media(content_result, request_timeout, allow_insecure_http)
            if generated is not None:
                return generated, poll_count
            raise SilkDockError("Video completed without downloadable content")

        if status in SUCCESS_STATES:
            raise SilkDockError(f"{media} generation completed without media data")
        if not job_id:
            raise SilkDockError(f"SilkDock returned neither {media} data nor a pollable job id")
        if time.monotonic() >= deadline:
            raise SilkDockError(f"{media} generation did not finish within {total_timeout:g} seconds")

        remaining = max(0.0, deadline - time.monotonic())
        time.sleep(min(_poll_delay(result, poll_interval), remaining))
        poll_url = _poll_url(result, base_url, media, job_id)
        _validate_url(poll_url, allow_insecure_http)
        poll_count += 1
        result = _request_json("GET", poll_url, api_key, None, request_timeout)


def _parse_extra_params(values: list[str]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for value in values:
        if "=" not in value:
            raise SilkDockError(f"Invalid --param {value!r}; expected KEY=JSON_VALUE")
        key, raw = value.split("=", 1)
        key = key.strip()
        if not key or key in RESERVED_PARAMS:
            raise SilkDockError(f"--param cannot set reserved field {key!r}")
        if re.fullmatch(r"[A-Za-z0-9_.-]+", key) is None:
            raise SilkDockError(f"Invalid --param field name {key!r}")
        try:
            params[key] = json.loads(raw)
        except json.JSONDecodeError:
            params[key] = raw
    return params


def _local_reference_path(value: str) -> Path | None:
    if parse.urlparse(value).scheme in {"https", "http"}:
        return None
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise SilkDockError(f"Reference file not found: {path}")
    return path


def _reference_media_kind(value: str) -> str | None:
    parsed = parse.urlparse(value)
    candidate = parsed.path if parsed.scheme in {"https", "http"} else value
    mime = mimetypes.guess_type(candidate)[0]
    if not mime:
        return None
    kind = mime.split("/", 1)[0].lower()
    return kind if kind in MEDIA_KINDS else None


def _append_payload_value(
    payload: dict[str, Any], key: str, value: str, *, multiple: bool
) -> None:
    if not multiple:
        if key in payload:
            raise SilkDockError(f"Only one value is allowed for {key}")
        payload[key] = value
        return
    current = payload.setdefault(key, [])
    if not isinstance(current, list):
        raise SilkDockError(f"Cannot combine scalar and list values for {key}")
    current.append(value)


def _add_media_reference(
    *,
    payload: dict[str, Any],
    file_fields: list[tuple[str, Path]],
    key: str,
    value: str,
    multiple: bool,
    allow_insecure_http: bool,
) -> None:
    local_path = _local_reference_path(value)
    if local_path is not None:
        file_fields.append((key, local_path))
        return
    _validate_url(value, allow_insecure_http)
    _append_payload_value(payload, key, value, multiple=multiple)


def _route_legacy_video_references(values: list[str]) -> dict[str, list[str]]:
    """Keep single-image I2V compatibility; route multiple refs as multimodal."""
    if not values:
        return {}
    if len(values) == 1 and _reference_media_kind(values[0]) in {None, "image"}:
        return {"input_reference": values}

    routed: dict[str, list[str]] = {}
    for value in values:
        kind = _reference_media_kind(value)
        if kind == "video":
            key = "reference_video_urls"
        elif kind == "audio":
            key = "reference_audio_urls"
        else:
            key = "reference_image_urls"
        routed.setdefault(key, []).append(value)
    return routed


def _model_mode(model: dict[str, Any]) -> str | None:
    explicit_mode = model.get("mode")
    if isinstance(explicit_mode, str):
        normalized_mode = explicit_mode.lower()
        if "video" in normalized_mode:
            return "video"
        if "image" in normalized_mode:
            return "image"
        if normalized_mode in {"chat", "completion", "embedding", "audio", "rerank", "search"}:
            return None

    capability_parts: list[str] = []
    for key in ("supported_endpoints", "output_modalities", "modalities", "capabilities"):
        value = model.get(key)
        if isinstance(value, (list, dict)):
            capability_parts.append(json.dumps(value, sort_keys=True))
        elif isinstance(value, str):
            capability_parts.append(value)
    capabilities = " ".join(capability_parts).lower()
    if "video" in capabilities:
        return "video"
    if "image" in capabilities:
        return "image"

    name_parts: list[str] = []
    for key in ("id", "name"):
        value = model.get(key)
        if isinstance(value, str):
            name_parts.append(value)
    text = " ".join(name_parts).lower()
    if "video_generation" in text or any(hint in text for hint in VIDEO_HINTS):
        return "video"
    if "image_generation" in text or any(hint in text for hint in IMAGE_HINTS):
        return "image"
    return None


def _list_models(args: argparse.Namespace, base_url: str, api_key: str) -> int:
    result = _request_json("GET", f"{base_url}/models", api_key, None, args.request_timeout)
    models = result.get("data", result.get("models", []))
    if not isinstance(models, list):
        raise SilkDockError("SilkDock /models response does not contain a model list")

    search = args.search.lower() if args.search else None
    rows = []
    for model in models:
        if not isinstance(model, dict):
            continue
        model_id = model.get("id") or model.get("model") or model.get("name")
        if not isinstance(model_id, str):
            continue
        mode = _model_mode(model)
        if args.media and mode != args.media:
            continue
        if search and search not in model_id.lower() and search not in json.dumps(model).lower():
            continue
        row = {"id": model_id, "media": mode or "unknown"}
        owner = model.get("owned_by") or model.get("provider")
        if isinstance(owner, str):
            row["provider"] = owner
        rows.append(row)
    rows.sort(key=lambda row: (row["media"], row["id"]))
    print(json.dumps({"endpoint": f"{base_url}/models", "count": len(rows), "models": rows}, indent=2))
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Use SilkDock image and video generation models.")
    parser.add_argument("--auth-file", type=Path, default=_default_auth_file())
    parser.add_argument("--config-file", type=Path, default=_default_config_file())
    parser.add_argument("--base-url", help=f"Override the API base URL (default fallback: {DEFAULT_BASE_URL})")
    parser.add_argument("--request-timeout", type=float, default=90.0)
    parser.add_argument("--allow-insecure-http", action="store_true", help="Allow HTTP only for localhost testing")
    subparsers = parser.add_subparsers(dest="command", required=True)

    models = subparsers.add_parser("models", help="List models reported by SilkDock")
    models.add_argument("--media", choices=["image", "video"], help="Filter by detected media capability")
    models.add_argument("--search", help="Case-insensitive model metadata search")

    for media in ("image", "video"):
        article = "an" if media == "image" else "a"
        generate = subparsers.add_parser(media, help=f"Generate {article} {media}")
        if media == "image":
            generate.add_argument(
                "--model",
                default=DEFAULT_IMAGE_MODEL,
                help=f"Exact SilkDock model ID (default: {DEFAULT_IMAGE_MODEL})",
            )
        else:
            generate.add_argument(
                "--model",
                default=DEFAULT_VIDEO_MODEL,
                help=f"Exact SilkDock model ID (default: {DEFAULT_VIDEO_MODEL})",
            )
        generate.add_argument("--prompt", required=True)
        generate.add_argument(
            "--out",
            type=Path,
            help="Output path (default: a unique file under ./outputs)",
        )
        generate.add_argument("--endpoint", help="Override the endpoint path or absolute URL")
        generate.add_argument("--size", help="Provider-supported size, for example 1024x1024 or 1280x720")
        generate.add_argument("--aspect-ratio", help="Provider-supported aspect ratio, for example 16:9")
        generate.add_argument("--quality", help="Provider-supported quality setting")
        if media == "video":
            generate.add_argument("--duration", type=float, help="Video duration in seconds")
            generate.add_argument("--fps", type=int, help="Video frames per second")
        generate.add_argument(
            "--reference",
            action="append",
            default=[],
            help=(
                "Backward-compatible reference URL or local path; one image means I2V, "
                "while multiple images or video/audio files mean multimodal reference"
            ),
        )
        if media == "image":
            generate.add_argument(
                "--mask",
                help="Local mask image used for inpainting/editing",
            )
        else:
            generate.add_argument(
                "--input-reference",
                help="Single start/input image URL or local path for image-to-video",
            )
            generate.add_argument(
                "--reference-image",
                action="append",
                default=[],
                help="Semantic reference image URL or local path; repeatable",
            )
            generate.add_argument(
                "--reference-video",
                action="append",
                default=[],
                help="Reference video URL or local path; repeatable",
            )
            generate.add_argument(
                "--reference-audio",
                action="append",
                default=[],
                help="Reference audio URL or local path; repeatable",
            )
            generate.add_argument(
                "--first-frame",
                help="Explicit first-frame image URL or local path",
            )
            generate.add_argument(
                "--last-frame",
                help="Explicit last-frame image URL or local path",
            )
        generate.add_argument("--output-format", help="Requested output format, for example png, webp, or mp4")
        generate.add_argument("--param", action="append", default=[], metavar="KEY=JSON", help="Extra provider parameter; repeatable")
        default_poll_interval = DEFAULT_IMAGE_POLL_INTERVAL if media == "image" else DEFAULT_VIDEO_POLL_INTERVAL
        generate.add_argument(
            "--poll-interval",
            type=float,
            default=default_poll_interval,
            help=f"Minimum task status polling interval (default: {default_poll_interval:g}s)",
        )
        generate.add_argument("--timeout", type=float, default=900.0, help="Total generation timeout")
        generate.add_argument("--force", action="store_true", help="Overwrite an existing output")
        generate.add_argument("--dry-run", action="store_true", help="Validate and print redacted request settings")
    return parser


def main() -> int:
    operation_started = time.monotonic()
    args = _build_parser().parse_args()
    if args.request_timeout <= 0:
        raise SilkDockError("--request-timeout must be positive")

    auth_file = args.auth_file.expanduser().resolve()
    api_key, auth_base_url = _load_auth(auth_file)
    config_file = args.config_file.expanduser().resolve()
    config_base_url = _load_config_base_url(config_file)
    base_url = (args.base_url or config_base_url or auth_base_url or DEFAULT_BASE_URL).rstrip("/")
    _validate_url(base_url, args.allow_insecure_http)

    if args.command == "models":
        return _list_models(args, base_url, api_key)

    if args.poll_interval <= 0 or args.timeout <= 0:
        raise SilkDockError("Polling interval and timeout must be positive")
    _validate_poll_interval(args.command, args.poll_interval)
    if getattr(args, "duration", None) is not None and args.duration <= 0:
        raise SilkDockError("--duration must be positive")
    if getattr(args, "fps", None) is not None and args.fps <= 0:
        raise SilkDockError("--fps must be positive")

    if args.out is not None:
        out = args.out.expanduser()
    else:
        default_extension = "png" if args.command == "image" else "mp4"
        requested_extension = getattr(args, "output_format", None)
        extension = (
            requested_extension.lower().lstrip(".")
            if isinstance(requested_extension, str)
            and re.fullmatch(r"\.?[A-Za-z0-9]+", requested_extension)
            else default_extension
        )
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        out = Path("outputs") / f"silkdock-{args.command}-{timestamp}-{secrets.token_hex(3)}.{extension}"
    if out.exists() and not args.force:
        raise SilkDockError(f"Output already exists: {out}; use --force only when replacement is intended")

    if args.command == "image":
        default_path = (
            "/images/edits"
            if args.reference or getattr(args, "mask", None)
            else "/images/generations"
        )
    else:
        default_path = "/videos/generations"
    endpoint = args.endpoint or default_path
    endpoint = endpoint if parse.urlparse(endpoint).scheme else f"{base_url}/{endpoint.lstrip('/')}"
    _validate_url(endpoint, args.allow_insecure_http)

    extra_params = _parse_extra_params(args.param)
    payload: dict[str, Any] = {"model": args.model, "prompt": args.prompt}
    for key in ("size", "aspect_ratio", "quality", "duration", "fps", "output_format"):
        value = getattr(args, key, None)
        if value is not None:
            payload[key] = value
    file_fields: list[tuple[str, Path]] = []
    reference_transport: str | None = None
    if args.command == "image":
        reference_urls: list[str] = []
        for reference in args.reference:
            reference_file = _local_reference_path(reference)
            if reference_file is not None:
                file_fields.append(("image[]", reference_file))
            else:
                _validate_url(reference, args.allow_insecure_http)
                reference_urls.append(reference)
        if reference_urls:
            payload["images"] = [{"image_url": url} for url in reference_urls]
        transports = []
        if file_fields:
            transports.append(f"multipart:image[]({len(file_fields)})")
        if reference_urls:
            transports.append(f"json:images({len(reference_urls)})")
        reference_transport = "+".join(transports)
        mask = getattr(args, "mask", None)
        if mask:
            mask_path = _local_reference_path(mask)
            if mask_path is None:
                raise SilkDockError("--mask must be a local file so it can be uploaded")
            file_fields.append(("mask", mask_path))
            transports.append("multipart:mask")
        reference_transport = "+".join(transports) or None
    elif args.command == "video":
        routed_references = _route_legacy_video_references(args.reference)
        explicit_references = {
            "reference_image_urls": args.reference_image,
            "reference_video_urls": args.reference_video,
            "reference_audio_urls": args.reference_audio,
        }
        for key, values in explicit_references.items():
            if values:
                routed_references.setdefault(key, []).extend(values)

        if args.input_reference:
            if "input_reference" in routed_references:
                raise SilkDockError(
                    "Use either --input-reference or a single legacy --reference image, not both"
                )
            routed_references["input_reference"] = [args.input_reference]
        for key, values in routed_references.items():
            multiple = key != "input_reference"
            for value in values:
                _add_media_reference(
                    payload=payload,
                    file_fields=file_fields,
                    key=key,
                    value=value,
                    multiple=multiple,
                    allow_insecure_http=args.allow_insecure_http,
                )

        for key, value in (
            ("first_frame_url", args.first_frame),
            ("last_frame_url", args.last_frame),
        ):
            if value:
                _add_media_reference(
                    payload=payload,
                    file_fields=file_fields,
                    key=key,
                    value=value,
                    multiple=False,
                    allow_insecure_http=args.allow_insecure_http,
                )

        video_reference_keys = {
            "input_reference",
            "reference_image_urls",
            "reference_video_urls",
            "reference_audio_urls",
            "first_frame_url",
            "last_frame_url",
        }
        transports = [
            f"json:{key}({len(value) if isinstance(value, list) else 1})"
            for key, value in payload.items()
            if key in video_reference_keys
        ]
        if file_fields:
            transports.append(f"multipart:media({len(file_fields)})")
        reference_transport = "+".join(transports) or None
    payload.update(extra_params)

    if args.dry_run:
        reference_count = len(args.reference) + sum(
            len(getattr(args, key, []))
            for key in ("reference_image", "reference_video", "reference_audio")
        ) + sum(
            1
            for key in ("input_reference", "first_frame", "last_frame", "mask")
            if getattr(args, key, None)
        )
        print(json.dumps({
            "status": "dry-run",
            "credential": "available",
            "auth_file": str(auth_file),
            "config_file": str(config_file),
            "endpoint": endpoint,
            "media": args.command,
            "model": args.model,
            "output": str(out),
            "request_fields": sorted(payload)
            + sorted({field for field, _ in file_fields}),
            "prompt_characters": len(args.prompt),
            "has_reference": reference_count > 0,
            "reference_count": reference_count,
            "reference_transport": reference_transport,
        }, indent=2))
        return 0

    submit_started = time.monotonic()
    if file_fields:
        initial = _request_multipart_json(endpoint, api_key, payload, file_fields, args.request_timeout)
    else:
        initial = _request_json("POST", endpoint, api_key, payload, args.request_timeout)
    submit_seconds = time.monotonic() - submit_started
    print(json.dumps({
        "status": "running",
        "terminal": False,
        "media": args.command,
        "model": args.model,
        "job_id": _job_id(initial),
        "provider_status": _status(initial) or None,
        "poll_interval_seconds": args.poll_interval,
        "submit_seconds": round(submit_seconds, 3),
        "output": str(out.resolve()),
    }), file=sys.stderr, flush=True)
    wait_started = time.monotonic()
    generated, poll_count = _wait_for_media(
        initial,
        base_url,
        args.command,
        api_key,
        args.poll_interval,
        args.timeout,
        args.request_timeout,
        args.allow_insecure_http,
    )
    wait_download_seconds = time.monotonic() - wait_started
    if not generated:
        raise SilkDockError(f"SilkDock returned an empty {args.command}")

    save_started = time.monotonic()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(generated)
    save_seconds = time.monotonic() - save_started
    print(json.dumps({
        "status": "completed",
        "terminal": True,
        "media": args.command,
        "model": args.model,
        "output": str(out.resolve()),
        "bytes": len(generated),
        "poll_count": poll_count,
        "timing_seconds": {
            "submit": round(submit_seconds, 3),
            "wait_download": round(wait_download_seconds, 3),
            "save": round(save_seconds, 3),
            "total": round(time.monotonic() - operation_started, 3),
        },
    }))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SilkDockError as exc:
        print(json.dumps({"status": "failed", "terminal": True, "error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
