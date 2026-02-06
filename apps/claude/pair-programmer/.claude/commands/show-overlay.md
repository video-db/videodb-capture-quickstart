---
description: Show overlay window on screen
---

Display an overlay window with text. Optional `--loading` shows a loading state (e.g. after assistant shortcut); a later call with `--text` clears loading and shows content.

## Command

```bash
# Show with content (clears loading if active)
node .claude/skills/pair-programmer/recorder-control.js overlay-show --text "Your message here"

# Show loading state only
node .claude/skills/pair-programmer/recorder-control.js overlay-show --loading
```

## Use Cases

- Show status messages
- Display reminders
- Highlight information for user
- Loading state is shown automatically on assistant shortcut; call with `--text` when ready to show the response
