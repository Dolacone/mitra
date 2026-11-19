---
title: Logging
description: Choose how much Mitra logs with MITRA_LOG_LEVEL, and which level helps with which problem.
---

Mitra logs to standard output, so `docker compose logs` shows everything:

```bash
docker compose logs -f mitra
```

A healthy server is quiet on purpose: by default it only logs what matters. Turn the level up while you track something down, and back down when you're done.

## Set the level

```yaml
environment:
  MITRA_LOG_LEVEL: 'debug'
```

Each level includes everything quieter than it:

| `MITRA_LOG_LEVEL` | What you get |
| --- | --- |
| `error` | Failures only. |
| `warn` | Also problems Mitra worked around, such as a reminder that couldn't be delivered, a geocoder that didn't answer, or a sign-in provider it couldn't reach. |
| `info` *(default)* | Also what matters day to day: starting up, sign-ins and reminders sent. |
| `debug` | Also every request with its status and time, sessions and entry edits. |
| `trace` | Also every database query and the raw calendar data. There's a lot of it. |

Mitra logs the level it runs at when it starts.

> [!NOTE]
> Passwords, tokens and other secrets are never logged, at any level. `debug` and `trace` can still show entry titles and calendar data, so look through a log before you share it.

## Which level to use

- When reminders don't arrive, `info` already logs each reminder as it goes out, and `debug` adds each delivery attempt and devices that were dropped.
- When you see an error page, `error` has it with a stack trace, and the default `info` includes it.
- When you need to see exactly what was stored, `trace` adds the raw data and the database queries. Only leave it on briefly.
