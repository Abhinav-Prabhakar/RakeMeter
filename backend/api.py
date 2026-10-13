"""The JSON API over the service.

    GET   /api/health                    {"ok": true}
    GET   /api/rules                     the rulebook
    GET   /api/day?at=                   the day
    GET   /api/day/state?t=              {"t", "rakes"}: every rake at minute t
    GET   /api/rakes/{slot}/options?at=  what moving or holding a rake would do
    PATCH /api/rakes/{slot}              body: the patch, plus an optional "at"
    GET   /api/months                    {"months"}
    GET   /api/months/{id}/bills         {"month", "bills"}
    PATCH /api/bills/{id}                body: the patch
    POST  /api/reset                     forget every choice

Every error is {"error": {"code", "message"}}; the page is on another port, so localhost
origins get CORS headers (errors included).
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
from http import HTTPStatus
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.service import Service, ServiceError
from backend.store import open_store

log = logging.getLogger(__name__)

DEFAULT_STATE = Path(__file__).resolve().parent / "data" / "state.json"
LOCAL_ORIGIN = r"http://(localhost|127\.0\.0\.1)(:\d+)?"
STATUS = {"invalid": 400, "not_found": 404, "conflict": 409}
NUMBER = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
INTEGER = re.compile(r"[+-]?\d+")


def _error(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers=headers)


def _number(request: Request, name: str, required: bool = False):
    """The query number `name` (an int if written as one), None if absent; ServiceError if it is not a real number."""
    text = request.query_params.get(name)
    if text is None:
        if required:
            raise ServiceError("invalid", f"{name} is required")
        return None
    if not NUMBER.fullmatch(text):
        raise ServiceError("invalid", f"{name} must be a number")
    value = int(text) if INTEGER.fullmatch(text) else float(text)
    if not math.isfinite(value):
        raise ServiceError("invalid", f"{name} must be a finite number")
    return value


def _refuse_constant(name: str):
    raise ValueError(f"{name} is not valid JSON")


async def _body(request: Request) -> dict:
    """The request body as a JSON object; anything else is "invalid"."""
    try:
        body = json.loads(await request.body(), parse_constant=_refuse_constant)
    except (ValueError, RecursionError):
        raise ServiceError("invalid", "the body must be a JSON object") from None
    if not isinstance(body, dict):
        raise ServiceError("invalid", "the body must be a JSON object")
    return body


class _CatchAll:
    """Turns an unexpected crash into a clean 500, inside the CORS layer so the page can still read it."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started = False

        async def watching(message):
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, receive, watching)
        except Exception:
            log.exception("unhandled error")
            if started:
                raise
            await _error(500, "internal", "something went wrong")(scope, receive, send)


def create_app(service: Service) -> FastAPI:
    """The API over `service`."""
    app = FastAPI(title="Train management", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(_CatchAll)
    app.add_middleware(CORSMiddleware, allow_origin_regex=LOCAL_ORIGIN, allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
                       allow_headers=["*"])

    # ------------------------------------------------------------ errors
    @app.exception_handler(ServiceError)
    async def refused(_, exc: ServiceError):
        return _error(STATUS.get(exc.code, 400), exc.code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def no_route(_, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "error")
        return _error(exc.status_code, code, HTTPStatus(exc.status_code).phrase, getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def malformed(_, exc: RequestValidationError):
        return _error(400, "invalid", "the request is malformed")

    # ------------------------------------------------------------ reading
    @app.get("/api/health")
    def health():
        return JSONResponse({"ok": True})

    @app.get("/api/rules")
    def rules():
        return JSONResponse(service.rules())

    @app.get("/api/day")
    def day(request: Request):
        return JSONResponse(service.day(_number(request, "at")))

    @app.get("/api/day/state")
    def state(request: Request):
        t = _number(request, "t", required=True)
        return JSONResponse({"t": t, "rakes": service.state(t)})

    @app.get("/api/rakes/{slot}/options")
    def options(slot: str, request: Request):
        return JSONResponse(service.options(slot, _number(request, "at")))

    @app.get("/api/months")
    def months():
        return JSONResponse({"months": service.months()})

    @app.get("/api/months/{month_id}/bills")
    def bills(month_id: str):
        shown = service.bills(month_id)
        month = next(m for m in service.months() if m["id"] == month_id)
        return JSONResponse({"month": month, "bills": shown})

    # ------------------------------------------------------------ writing
    @app.patch("/api/rakes/{slot}")
    async def patch_rake(slot: str, request: Request):
        patch = await _body(request)
        patch_keys = set(patch)
        at = patch.pop("at", None)
        if at is None and "at" in patch_keys:
            at = math.nan                             # an explicit null is not a minute: the service refuses it
        return JSONResponse(await run_in_threadpool(service.set_rake, slot, patch, at))

    @app.patch("/api/bills/{bill_id}")
    async def patch_bill(bill_id: str, request: Request):
        patch = await _body(request)
        return JSONResponse(await run_in_threadpool(service.set_bill, bill_id, patch))

    @app.post("/api/reset")
    def reset():
        return JSONResponse(service.reset())

    return app


app = create_app(Service(open_store(os.environ.get("TRAIN_STATE", DEFAULT_STATE))))
