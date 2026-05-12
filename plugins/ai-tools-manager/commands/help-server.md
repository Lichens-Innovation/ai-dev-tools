---
allowed-tools: Bash(docker:*), Bash(open:*)
description: Start the AI Dev Tools help server and open the dashboard in the browser
---

## Your task

Manage the help-server using Docker Compose.

- Compose file location: `/Users/samueldaigle/Documents/gits/ai-dev-tools/help-server/docker-compose.yml`
- URL: `http://localhost:3008`

Follow this decision tree (run checks in parallel where possible):

### 1. Check if the service is already running
```bash
cd /Users/samueldaigle/Documents/gits/ai-dev-tools/help-server && docker compose ps --format "{{.State}}"
```

**If the output contains `running`:**
- The server is already up. Just open the dashboard:
  ```bash
  open http://localhost:3008
  ```

**If the output is empty, `exited`, or `stopped`:**
- Start (and build if necessary) the service:
  ```bash
  cd /Users/samueldaigle/Documents/gits/ai-dev-tools/help-server && docker compose up -d
  ```
- Wait 5 seconds, then open the dashboard:
  ```bash
  open http://localhost:3008
  ```

### 2. First-time or rebuild note
If the user says the image is outdated or needs a rebuild, add `--build`:
```bash
cd /Users/samueldaigle/Documents/gits/ai-dev-tools/help-server && docker compose up -d --build
```

Report which case applied (already running / started with docker compose / rebuilt and started).
