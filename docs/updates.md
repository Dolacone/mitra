---
title: Updates
description: How to choose an image tag and update Mitra.
---

Mitra never updates itself: pulling the new version is up to you.

## Choose an image tag

The tag decides how eagerly you move to new versions.

| Tag | What you get |
| --- | --- |
| `latest` | The newest release. |
| `0.6` | The newest `0.6.x` release: fixes, but no new minor version. |
| `0.6.0` | Exactly that version. |
| `dev` | The latest commit on `main`, for trying things before they're released. |

Until 1.0, a new minor version (0.6 to 0.7) can change things you rely on. If you'd rather choose when that happens, use `0.6` and move on when you're ready. All tags are listed on [GitHub](https://github.com/a11delavar/mitra/pkgs/container/mitra).

## Update Mitra

Pull the new image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

Your data is in the mounted folder, so it survives. If the new version changes the database, Mitra updates it when it starts, and you never have to touch it yourself. Tools like [Watchtower](https://containrrr.dev/watchtower/) can do this for you on a schedule.

Which version you get depends on your [image tag](#choose-an-image-tag). Before you move to a new minor version, it's worth reading the [release notes](https://github.com/a11delavar/mitra/releases).
