# Meta Suite ChatGPT Bridge

A Chrome extension that bridges Meta Business Suite with ChatGPT to automate customer service responses.

## Overview

This extension extracts questions from Meta Business Suite's inbox and automatically gets answers from ChatGPT. It can operate in two modes:

- **Full Automation**: Automatically responds to customer messages with ChatGPT-generated answers
- **Partial Automation**: Opens conversations and prepares draft responses, but requires manual review and sending

## Features

- Automatically detects unread messages in Meta Business Suite
- Sends questions to ChatGPT and retrieves answers
- Injects responses back into Meta Business Suite conversations
- Configurable automation levels (full or partial)
- "Next" button for manual control in partial automation mode
- Simple popup interface for controlling settings

## Project Structure

```
/
├── manifest.json            # Extension manifest (root level)
└── src/
    ├── background/          # Background service worker
    │   ├── index.js         # Main background script
    │   ├── handlers.js      # Message handlers
    │   ├── chatgptService.js # ChatGPT interaction logic
    │   ├── questionTracking.js # Question tracking utilities
    │   └── utils.js         # General utilities
    ├── content/             # Content scripts
    │   ├── index.js         # Main content script
    │   ├── messageExtractor.js # Message extraction logic
    │   ├── messageHandler.js # Message handling logic
    │   └── automation.js    # Automation control
    ├── chatgpt/             # ChatGPT interaction
    │   └── chatgpt-interactor.js # Script injected into ChatGPT
    └── popup/               # Extension popup
        ├── popup.html       # Popup HTML
        └── popup.js         # Popup logic
```

## Installation

### Development Mode

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the root directory of this project (not the src directory)

### Production Use

1. Build the extension (see Building section)
2. Install the packaged extension from the Chrome Web Store or manually

## Usage

1. Install the extension
2. Open the extension popup by clicking the extension icon in Chrome
3. Toggle "Enable Automation" to turn the feature on/off
4. Choose between full or partial automation mode
5. Navigate to Meta Business Suite inbox
6. The extension will automatically process unread messages

### Partial Automation Mode

In partial automation mode:

1. The extension will detect unread messages
2. It will prepare responses but not send them automatically
3. You can review and manually send each response
4. Use the "Next" button to process the next message

## Development

### Prerequisites

- Node.js and npm (for development tools)
- Chrome browser

### Setup

1. Clone the repository
2. Install dependencies: `npm install`

### Building

To build the extension for production:

```
npm run build
```

This will create a packaged extension in the `dist` directory.

## Permissions

This extension requires the following permissions:

- `storage`: To store extension settings
- `activeTab`: To interact with the active tab
- `scripting`: To inject scripts into pages
- `tabs`: To manage and interact with browser tabs

## Host Permissions

- `https://business.facebook.com/*`: To interact with Meta Business Suite
- `https://*.meta.com/*`: To interact with Meta domains
- `https://chatgpt.com/*`: To interact with ChatGPT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Meta or OpenAI. Use at your own risk.
# wa-gpt-plugin
