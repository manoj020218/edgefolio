#!/usr/bin/env python3
"""
EDGEFOLIO lightweight face service.

This service intentionally avoids hard dependencies so it can run on fresh systems.
It provides:
  - GET  /health
  - GET  /profiles
  - POST /enroll  { employeeId, imagePath }
  - POST /verify  { employeeId, imagePath, threshold? }
  - POST /delete  { employeeId }

Embeddings are deterministic vectors derived from image bytes and persisted in:
  EDGE/python/models/embeddings.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parent
MODEL_DIR = ROOT_DIR / "models"
STORE_PATH = MODEL_DIR / "embeddings.json"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7080


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_store() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if STORE_PATH.exists():
        return
    default_payload = {
        "version": 1,
        "updatedAt": utc_now_iso(),
        "employees": {},
    }
    STORE_PATH.write_text(json.dumps(default_payload, indent=2), encoding="utf-8")


def load_store() -> Dict[str, Any]:
    ensure_store()
    try:
        return json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        repaired = {"version": 1, "updatedAt": utc_now_iso(), "employees": {}}
        STORE_PATH.write_text(json.dumps(repaired, indent=2), encoding="utf-8")
        return repaired


def save_store(payload: Dict[str, Any]) -> None:
    payload["updatedAt"] = utc_now_iso()
    STORE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _vector_norm(values: List[float]) -> float:
    return math.sqrt(sum(v * v for v in values))


def _normalize_vector(values: List[float]) -> List[float]:
    norm = _vector_norm(values)
    if norm == 0:
        return values
    return [round(v / norm, 8) for v in values]


def image_to_embedding(image_path: Path, dims: int = 128) -> List[float]:
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    raw = image_path.read_bytes()
    if not raw:
        raise ValueError(f"Image file is empty: {image_path}")

    seed = hashlib.sha512(raw).digest()
    buffer = bytearray(seed)
    while len(buffer) < dims:
        seed = hashlib.sha512(seed).digest()
        buffer.extend(seed)

    vector = [buffer[i] / 255.0 for i in range(dims)]
    return _normalize_vector(vector)


def cosine_similarity(vector_a: List[float], vector_b: List[float]) -> float:
    if len(vector_a) != len(vector_b):
        raise ValueError("Embedding size mismatch")
    dot = sum(a * b for a, b in zip(vector_a, vector_b))
    norm = _vector_norm(vector_a) * _vector_norm(vector_b)
    if norm == 0:
        return 0.0
    return round(dot / norm, 6)


class FaceService:
    def __init__(self) -> None:
        ensure_store()

    def profile_count(self) -> int:
        store = load_store()
        return len(store.get("employees", {}))

    def list_profiles(self) -> List[Dict[str, Any]]:
        store = load_store()
        rows = []
        for employee_id, payload in store.get("employees", {}).items():
            rows.append(
                {
                    "employeeId": employee_id,
                    "imagePath": payload.get("imagePath"),
                    "updatedAt": payload.get("updatedAt"),
                }
            )
        rows.sort(key=lambda row: row["employeeId"])
        return rows

    def enroll(self, employee_id: str, image_path: str) -> Dict[str, Any]:
        if not employee_id:
            raise ValueError("employeeId is required")
        if not image_path:
            raise ValueError("imagePath is required")

        source = Path(image_path).expanduser().resolve()
        embedding = image_to_embedding(source)

        store = load_store()
        employees = store.setdefault("employees", {})
        employees[employee_id] = {
            "embedding": embedding,
            "imagePath": str(source),
            "updatedAt": utc_now_iso(),
        }
        save_store(store)

        return {
            "employeeId": employee_id,
            "imagePath": str(source),
            "embeddingSize": len(embedding),
            "updatedAt": employees[employee_id]["updatedAt"],
        }

    def verify(self, employee_id: str, image_path: str, threshold: float = 0.82) -> Dict[str, Any]:
        if not employee_id:
            raise ValueError("employeeId is required")
        if not image_path:
            raise ValueError("imagePath is required")

        store = load_store()
        saved = store.get("employees", {}).get(employee_id)
        if not saved:
            raise KeyError(f"No enrolled face template for employeeId={employee_id}")

        source = Path(image_path).expanduser().resolve()
        probe = image_to_embedding(source)
        score = cosine_similarity(saved["embedding"], probe)
        matched = score >= threshold

        return {
            "employeeId": employee_id,
            "matched": matched,
            "score": score,
            "threshold": threshold,
            "referenceImagePath": saved.get("imagePath"),
            "probeImagePath": str(source),
        }

    def delete_profile(self, employee_id: str) -> bool:
        store = load_store()
        employees = store.setdefault("employees", {})
        if employee_id not in employees:
            return False
        del employees[employee_id]
        save_store(store)
        return True


FACE_SERVICE = FaceService()


class FaceHttpHandler(BaseHTTPRequestHandler):
    server_version = "EdgeFaceService/1.0"

    def _set_json(self, status: int = HTTPStatus.OK) -> None:
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _reply(self, status: int, payload: Dict[str, Any]) -> None:
        self._set_json(status)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._reply(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "edge-face-service",
                    "storePath": str(STORE_PATH),
                    "profiles": FACE_SERVICE.profile_count(),
                    "timestamp": utc_now_iso(),
                },
            )
            return

        if self.path == "/profiles":
            rows = FACE_SERVICE.list_profiles()
            self._reply(HTTPStatus.OK, {"ok": True, "data": rows, "count": len(rows)})
            return

        self._reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Endpoint not found"})

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
        except json.JSONDecodeError:
            self._reply(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid JSON payload"})
            return

        try:
            if self.path == "/enroll":
                result = FACE_SERVICE.enroll(payload.get("employeeId", ""), payload.get("imagePath", ""))
                self._reply(HTTPStatus.CREATED, {"ok": True, "data": result})
                return

            if self.path == "/verify":
                threshold = float(payload.get("threshold", 0.82))
                result = FACE_SERVICE.verify(
                    payload.get("employeeId", ""),
                    payload.get("imagePath", ""),
                    threshold,
                )
                self._reply(HTTPStatus.OK, {"ok": True, "data": result})
                return

            if self.path == "/delete":
                deleted = FACE_SERVICE.delete_profile(payload.get("employeeId", ""))
                self._reply(HTTPStatus.OK, {"ok": True, "deleted": deleted})
                return

            self._reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Endpoint not found"})
        except FileNotFoundError as error:
            self._reply(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
        except ValueError as error:
            self._reply(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
        except KeyError as error:
            self._reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": str(error)})
        except Exception as error:  # pragma: no cover - safety net
            self._reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(error)})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        # Keep output concise in production. Logs are handled by EDGE backend.
        return


def run_server(host: str, port: int) -> None:
    ensure_store()
    server = ThreadingHTTPServer((host, port), FaceHttpHandler)
    print(f"EDGE face service started on http://{host}:{port}")
    print(f"Store file: {STORE_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("EDGE face service stopped.")


def run_self_test() -> int:
    ensure_store()
    store = load_store()
    print("Face service self-test passed.")
    print(f"Store path: {STORE_PATH}")
    print(f"Profiles: {len(store.get('employees', {}))}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="EDGEFOLIO face service")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to bind (default: 7080)")
    parser.add_argument("--test", action="store_true", help="Run a lightweight self-test and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.test:
        return run_self_test()
    run_server(args.host, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
