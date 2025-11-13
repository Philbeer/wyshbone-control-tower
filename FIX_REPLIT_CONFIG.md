# Fix .replit Configuration

## Problem
Two servers are running simultaneously causing EADDRINUSE error.

## Solution - Manual Steps Required

You need to manually edit the `.replit` file because I cannot modify it directly.

### Step 1: Open .replit File
In the Replit file tree, find and click on `.replit`

### Step 2: Replace ALL Contents
Delete everything in `.replit` and replace with this:

```toml
modules = ["nodejs-20", "web"]
run = "node server.js"
hidden = [".config", ".git", "generated-icon.png", "node_modules", "dist"]

[nix]
channel = "stable-24_05"

[[ports]]
localPort = 5000
externalPort = 80

[env]
PORT = "5000"
```

### Step 3: Save the File
Press Ctrl+S (or Cmd+S on Mac)

### Step 4: Stop Current Workflow
Click the Stop button (square icon) in the Console to stop the running workflow

### Step 5: Click RUN Button
Now when you click RUN, it will execute `node server.js` instead of the fullstack app

## What Changed
- ✅ Removed workflows configuration (no more auto-starting fullstack app)
- ✅ Changed run command from `npm run dev` to `node server.js`
- ✅ Removed postgresql module (not needed for in-memory app)
- ✅ Kept PORT=5000 environment variable
- ✅ Server will start cleanly on port 5000

## After Making Changes
The dashboard will be available at:
- **In Replit webview**: Automatically shows when you click RUN
- **Direct URL**: Check the webview URL bar (usually `https://[repl-name].[username].repl.co/status`)
