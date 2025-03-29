# CLAUDE.md for TypingMind MCP Extension

## Commands
- No specific build/lint/test commands as this is a simple JS extension for TypingMind

## Code Style Guide
- **Configuration**: Keep configuration values at top of file
- **Constants**: Use UPPER_CASE for constants like `MCP_BRIDGE_URL`
- **Async/Await**: Use async/await for promise handling
- **Promises**: Chain properly with catch handlers
- **Error Handling**: Use try/catch blocks with specific error messages
- **Comments**: Keep code self-documenting with minimal comments
- **Function Naming**: Use camelCase and descriptive names
- **String Templates**: Use backtick strings for dynamic content
- **DOM Manipulation**: Use clean, minimal DOM manipulation
- **Debugging**: Console log with prefixes (e.g., "MCP Extension:")
- **User Feedback**: Provide clear visual feedback for successes/errors

## Notes
- This extension interfaces with MCP-Bridge to expose Model Context Protocol tools in TypingMind
- Code should maintain backward compatibility with existing TypingMind extensions
- All interface points with MCP-Bridge should be clearly documented