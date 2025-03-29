# TypingMind MCP Extension

A TypingMind extension that integrates with [MCP-Bridge](https://github.com/SecretiveShell/MCP-Bridge) to bring Model Context Protocol tools into TypingMind.

## Installation

**Important:** It's highly recommended to download and verify this JavaScript file before using it. TypingMind only allows installation of extensions by providing a URL to a JavaScript file.

1. Download the `mcp-extension.js` file
2. Review the code to verify its safety and functionality
3. Host the file somewhere accessible (personal web server, GitHub Pages, etc.)
4. In TypingMind, add the extension by providing the URL to your hosted file

## Configuration

The extension uses a configurable host and port for MCP-Bridge defined at the top of the file:
```javascript
// MCP Bridge configuration
const MCP_BRIDGE_URL = 'http://localhost:8000';
```

You will need to modify this URL to match your MCP-Bridge setup before hosting the file.

## How It Works

This extension:
- Connects to your MCP-Bridge server
- Fetches available Model Context Protocol tools
- Registers them as TypingMind plugins
- Tools will appear with the prefix "MCP -" in your plugins list

## Visual Feedback

When the extension loads:

- **Success**: A blue notification will appear at the bottom right of the screen with information about the number of tools loaded
- **Error**: A red notification will appear at the bottom right if there's a connection issue or other error

Notifications automatically disappear after 5 seconds.

## Debugging

If you encounter issues:

1. Open your browser's developer console (F12 or right-click → Inspect → Console)
2. Look for logs prefixed with "MCP Extension"
3. Common errors:
   - Connection refused: Check if your MCP-Bridge is running
   - Invalid URL: Verify the `MCP_BRIDGE_URL` in the extension is correct
   - CORS errors: Your MCP-Bridge needs to allow requests from your TypingMind domain

## Limitations

- No support for resources or prompts yet
- Requires self-hosting the JS file

## References

- [TypingMind Extensions Documentation](https://docs.typingmind.com/typing-mind-extensions)
- [MCP-Bridge](https://github.com/SecretiveShell/MCP-Bridge)

## License

MIT License - See LICENSE file for details