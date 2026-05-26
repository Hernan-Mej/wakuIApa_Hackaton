import logging
import time
from typing import Any

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None
_redis_checked: bool = False
_memory_store: dict[str, tuple[float, str]] = {}


async def _get_redis() -> aioredis.Redis | None:
    """Return a connected Redis client, or None if unreachable.

    The first call probes the server; subsequent calls reuse the client (or
    permanently fall back to in-memory if the probe failed).
    """
    global _redis, _redis_checked
    if _redis_checked:
        return _redis
    _redis_checked = True
    try:
        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        _redis = client
        logger.info("Redis connected at %s", settings.redis_url)
    except (RedisError, OSError) as exc:
        _redis = None
        logger.warning("Redis unavailable (%s); using in-memory cache", exc)
    return _redis


async def cache_get(key: str) -> str | None:
    client = await _get_redis()
    if client is not None:
        try:
            return await client.get(key)
        except RedisError as exc:
            logger.warning("Redis GET failed: %s", exc)

    entry = _memory_store.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if expires_at < time.time():
        _memory_store.pop(key, None)
        return None
    return value


async def cache_set(key: str, value: str, ttl_seconds: int | None = None) -> None:
    ttl = ttl_seconds or settings.cache_ttl_seconds
    client = await _get_redis()
    if client is not None:
        try:
            await client.setex(key, ttl, value)
            return
        except RedisError as exc:
            logger.warning("Redis SETEX failed: %s", exc)

    _memory_store[key] = (time.time() + ttl, value)


async def cache_get_or_set(key: str, ttl_seconds: int | None, producer) -> tuple[Any, bool]:
    """Return (value, hit). `producer` is an async callable invoked on miss."""
    cached = await cache_get(key)
    if cached is not None:
        return cached, True
    value = await producer()
    await cache_set(key, value, ttl_seconds)
    return value, False
