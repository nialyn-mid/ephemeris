# Ephemeris

Ephemeris is a calendar and time-tracking engine for SillyTavern that allows you to manage custom world time and schedule world events that are injected into the character context.

## Features

- **Custom Calendars**: Support for automated creation and use of multiple calendar systems with customizable units.
- **Context Injection**: Automatically injects current world time and relevant upcoming events into the prompt.
- **Schedule UI**: A floating panel accessible via the Wand Menu to view past and upcoming events.
- **LLM Integration**: Includes tools that allow models to create calendars, schedule/record events, and update the world clock during roleplay.

## Settings

### Data & Calendars
- **Global Management**: Edit or reset the primary calendar definitions available to all chats.
- **Chat Management**: Configure chat-specific calendars, events, and the current world clock.

### Prompt Injection
- **Enable Injection**: Global toggle for adding calendar data to the AI's context.
- **Inject Calendar Details**: Choose whether to inject global definitions, chat-specific definitions, or both.
- **Calendar Frequency**: Control how often calendar logic is injected (Every request, once per turn, or once per chat).
- **Inject Events List**: Toggle the inclusion of upcoming/past events in the prompt.
- **Summarization Strategy**: Choose between showing all events or using "Significance Dropoff" to prune distant events.
- **Range Control**: Define the "Forward" and "Backward" windows for event visibility.
- **Reminders & Notices**: Configure proximity-based reminders and completion notices for scheduled events.

## Installation

### Via SillyTavern Extension Installer (Recommended)

1. Open SillyTavern.
2. Go to **Extensions** (puzzle icon) → **Install Extension**.
3. Paste the repository URL.
4. Click **Install**.
5. Refresh the page.

### Manual Installation

1. Navigate to your SillyTavern installation's `public/scripts/extensions/third-party` folder.
2. Clone this repository or download the ZIP into a folder named `ephemeris`.
3. Restart SillyTavern or refresh your browser.
