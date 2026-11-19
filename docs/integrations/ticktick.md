---
title: TickTick
description: Show the tasks of your TickTick lists in Mitra, and create, edit, complete and delete them there.
---

The TickTick integration shows the tasks of your TickTick lists as calendars in Mitra. Each list is a calendar of its own, and the inbox is one too. What you change in Mitra is written back to TickTick, and what you change in TickTick comes into Mitra within a minute.

## Connect TickTick

1. In the [TickTick web app](https://ticktick.com/webapp/), open **Settings**, then **Account**, then **API Token**, and create a token.
2. In Mitra, choose **Add Integration** at the foot of the sidebar, then **TickTick**.
3. Paste the token and press **Connect**.
4. Tick the lists you want in Mitra, then press **Save**.

You add the integration once. To show more lists later, edit the integration and tick them.

> [!CAUTION]
> The token gives access to your whole TickTick account. If it leaks, delete it in TickTick and connect again with a new one.

## What comes into Mitra

Every open task of a ticked list comes in, the tasks completed in the last 90 days, and the won't-do tasks dated from then on. A task's dates become its schedule:

- A task on a day, without a time, is an all-day task on that day.
- A task at a time is a moment at that time.
- A task without a date waits under **Unscheduled** in [Planning](../planning.md).

Its title, its text, its repeat and its status come along too. A checklist task's items become a checklist in its description, which you can tick in Mitra. A task is **To Do**, **Done** or **Cancelled**: TickTick's open, completed and won't-do.

## What stays in TickTick

Priority, tags, reminders, columns and subtasks stay as TickTick has them. Mitra doesn't show them, and its edits leave them alone.

TickTick keeps one date or time per task, so a task there has no end: Mitra makes it a moment or a single day, and you can't stretch it. TickTick calendars hold no due date apart from the schedule, no estimate, no location and no attachments, so the editor leaves those rows out. They hold only tasks: an event or availability can't go there.

## Repeating tasks

TickTick keeps a repeating task as one task that moves on to its next date when you complete it. Mitra shows its dates from there on.

- Ticking the next date completes the task, and TickTick moves it on.
- Moving or editing any of its dates changes all of them.
- One date can't be changed, cancelled or deleted on its own. Make those changes in TickTick.

A repeat TickTick lists as single dates rather than a rule shows as a task on its next date only, and Mitra leaves the repeat as it is.
