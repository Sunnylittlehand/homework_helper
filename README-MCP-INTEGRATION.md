# MCP Integration with Homework Helper

This document explains how the Homework Helper app has been enhanced to work with Model Context Protocol (MCP) servers and how to test the implementation.

## Overview of Changes

1. **Enhanced Permission Question Handling**
   - Improved detection of permission-type questions
   - Added database tracking of permission questions and parent replies
   - Enhanced parent reply display in the chatbot

2. **Parent Reply Simulator**
   - Created a testing tool to simulate parent WhatsApp replies
   - Allows testing without needing WhatsApp authentication

3. **Twilio Integration**
   - Maintained and enhanced the existing Twilio integration
   - Added better tracking of question-answer pairs

## How to Test the Implementation

### Step 1: Start the Backend Server

```bash
node proxy.mjs
```

This will start the Express server on port 3001 (or the port specified in your environment variables).

### Step 2: Open the Homework Helper App

Open `index.html` in your browser to access the main Homework Helper app.

### Step 3: Open the Parent Simulator

Open `parent-simulator.html` in another browser tab or window. This will be your tool for simulating parent replies.

### Step 4: Test the Permission Question Flow

1. In the Homework Helper app, type a permission question in the chatbot, such as:
   - "Can I play Minecraft now?"
   - "Can I have a snack?"
   - "Can I watch TV?"

2. The chatbot will respond with a message indicating it has asked your parent.

3. In the Parent Simulator tab, you can:
   - Use one of the quick reply buttons
   - Type a custom reply
   - Click "Send Reply" to simulate a parent's WhatsApp response

4. Go back to the Homework Helper tab and observe:
   - The parent's reply should appear in the chat with emoji formatting
   - The message will have a green background to indicate it's from a parent

## Using MCP Servers (Future Enhancement)

While the current implementation uses Twilio for WhatsApp messaging, you can enhance it further with MCP servers when WhatsApp authentication becomes available:

### WhatsApp MCP Server

The WhatsApp MCP server could replace Twilio for direct WhatsApp integration:

```javascript
// Example of using WhatsApp MCP to send a message
const response = await fetch('http://localhost:3000/api/use_mcp_tool', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server_name: 'github.com/lharries/whatsapp-mcp',
    tool_name: 'send_message',
    arguments: {
      recipient: "PHONE_NUMBER", // Without + or other symbols
      message: "Your child asked: " + question
    }
  })
});
```

### Firecrawl MCP Server

The Firecrawl MCP server could be used to enhance the homework helper with web content:

```javascript
// Example of using Firecrawl to get educational content
const response = await fetch('http://localhost:3000/api/use_mcp_tool', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server_name: 'github.com/mendableai/firecrawl-mcp-server',
    tool_name: 'firecrawl_search',
    arguments: {
      query: "math practice problems for 9 year old",
      limit: 3,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true
      }
    }
  })
});
```

### Git MCP Server

The Git MCP server could be used for version control of homework assignments:

```javascript
// Example of using Git MCP to commit homework changes
const response = await fetch('http://localhost:3000/api/use_mcp_tool', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server_name: 'github.com/modelcontextprotocol/servers/tree/main/src/git',
    tool_name: 'git_commit',
    arguments: {
      repo_path: "/path/to/homework/repo",
      message: "Updated homework for " + new Date().toISOString().split('T')[0]
    }
  })
});
```

## Troubleshooting

If you encounter issues with the parent reply simulation:

1. **Check the server logs** - Look for any errors in the terminal where you're running `proxy.mjs`
2. **Verify the API endpoint** - Make sure the Parent Simulator is using the correct API_BASE URL
3. **Check browser console** - Open the browser developer tools to see any JavaScript errors
4. **Database issues** - If the database seems corrupted, stop the server and delete the `chatbot.db` file, then restart

## Next Steps

1. When WhatsApp authentication becomes available on your Mac Cursor IDE, you can transition from the simulator to the real WhatsApp MCP integration
2. Consider adding more MCP server integrations to enhance the app's functionality
3. Explore using the Firecrawl MCP server to fetch educational content related to homework topics
