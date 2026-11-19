---
title: Calendars
description: Add, rename, recolor, reorder and hide calendars, pick where new entries go, and move entries between calendars.
---

Every row in the sidebar's **Calendars** tab is a calendar [stored in Mitra](integrations/mitra.md). They sit under the Mitra heading.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/screenshots/calendars-detail-dark.webp">
  <img src="../assets/screenshots/calendars-detail-light.webp" alt="The sidebar, listing five calendars, each in its own colour" />
</picture>

A calendar is one row, even when it holds both events and tasks. Whether a given entry is an event or a task belongs to the entry.

## Add or delete a calendar

Add a calendar with **New calendar** in the **⋯** menu on the Mitra heading, and delete one with **Delete calendar** in its own **⋯** menu. If it still has entries, Mitra asks first, so nothing is lost by accident.

## Hide a calendar

The eye at the end of a row hides that calendar's entries. Hiding is only about what you see: its entries come straight back when you show it again. Search still finds them, dimmed.

Hiding doesn't mute a calendar, so its [reminders](reminders.md) still go off. To stop a calendar entirely, turn it off under the Mitra heading's **⋯ → Edit**.

### Show only one calendar

To clear everything else away, choose **Only show this calendar** in a calendar's **⋯** menu, or <kbd>Alt</kbd>-click its eye. Every other calendar hides, and Mitra remembers which ones you had showing. The same menu item then reads **Show previously visible calendars** and brings them back.

Calendars that were already hidden before stay hidden. A calendar you added in the meantime shows, since it wasn't part of what you put away. Showing a calendar by hand doesn't cost you the way back to the rest either. You can also do both from the [command palette](shortcuts.md) by searching for a calendar's name.

## Rename

Double-click a calendar's name, or choose **Rename** in its **⋯** menu.

## Recolor

Pick a color in the calendar's **⋯** menu. Until you do, Mitra picks one from the calendar's address, so it looks the same on every device. Entries take their calendar's color unless they have a color of their own.

## Reorder

Calendars start in the order you added them. To arrange them yourself, drag a calendar up or down. On a touch screen, press and hold for a moment before you drag, since a plain swipe scrolls the list. **Move up** and **Move down** in the **⋯** menu do the same without dragging.

A calendar you add later joins the end, so it doesn't disturb the order you set.

## Where new entries land

The calendar with the filled icon is your default: new entries go there unless you pick another. Click a calendar's icon to make it the default, and click the default's icon again to clear it. Without a default, or while yours is hidden, new entries go to the first calendar that's showing, and the filled icon moves there, so moving a calendar to the top also makes it the default. The same choice is under **Settings → Entries**.

New entries are events. While an entry is new, its editor has an **Event** / **Task** switch. Once it's saved, change it with **Type** in the editor, as long as its calendar can hold the other kind. A repeating entry keeps its type.

## Move an entry to another calendar

To move an entry, open it and pick another calendar in its editor. For a repeating entry, Mitra asks which ones you mean. **This entry** moves that one occurrence on its own, **This and following entries** moves the rest of the series and leaves the earlier occurrences behind, and **All entries** moves the whole series, repeat rule and all.
