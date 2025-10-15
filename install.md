# Installing Buddy

## Prerequisites

- Bun 1.3.0 or later

## Step 1: Build the Binary

From the buddy project directory:

```bash
# Using the build script (recommended)
bun run build

# Or directly with bun
bun build --compile --outfile=dist/buddy src/index.ts
```

This creates `dist/buddy` (or `dist/buddy.exe` on Windows).

## Step 2: Install the Binary

Move the binary to a location in your PATH:

### macOS/Linux

```bash
# System-wide (requires sudo)
sudo mv dist/buddy /usr/local/bin/buddy

# Or user-local (no sudo needed)
mkdir -p ~/.local/bin
mv dist/buddy ~/.local/bin/buddy
# Add ~/.local/bin to PATH if not already there
```

### Windows

```powershell
# Move to a directory in your PATH, e.g.:
move dist\buddy.exe C:\Windows\System32\buddy.exe

# Or create a local bin directory
mkdir C:\Users\YourName\bin
move dist\buddy.exe C:\Users\YourName\bin\buddy.exe
# Add C:\Users\YourName\bin to your PATH
```

Verify installation:

```bash
buddy --version
```

## Step 3: Initialize Your Pool

```bash
buddy init
```

This creates `~/.buddy/pools/local/` with subdirectories for agents, commands, and shared context.

## Step 4: Add the Buddy Slash Command

From the buddy project directory:

```bash
# Add the buddy slash command to your local pool
buddy add -c buddy
```

This copies `.claude/commands/buddy.md` to `~/.buddy/pools/local/commands/`.

## Step 5: Use in Other Projects

In any project where you want the `/buddy` slash command:

```bash
# Import to project's .claude/commands/
buddy import local/commands/buddy -j

# Or import to personal Claude commands (available everywhere)
buddy import local/commands/buddy -g
```

Now you can use `/buddy claude <context-path>` in Claude Code to load templates and context from your pools!

## Quick Start

After installation, create your first template:

```bash
mkdir -p ~/.buddy/pools/local/shared
cat > ~/.buddy/pools/local/shared/claude-init.md << 'EOF'
# Project Configuration Template

Instructions for Claude Code on this project.

## Standards
- Follow project conventions
- Write tests
- Document changes

## Build
- Build: [command]
- Test: [command]
EOF
```

Then in Claude Code:
```
/buddy claude local/claude-init
```

Claude will use your template to create a project-specific CLAUDE.md.

## Using Remote Repositories for Team Sharing

Instead of creating templates locally, you can share a repository of templates, agents, and commands across your team or organization:

```bash
# Add a shared templates repository
buddy add https://github.com/tsal/buddy-example.git

# Use templates from the repo
buddy import buddy-example/example-agent -j

# Or load context in Claude Code
/buddy claude buddy-example/project-init
```

This approach lets you:
- **Version control** your team's standards and templates
- **Share across projects** - every team member has access
- **Update centrally** - run `buddy add <url>` again to pull latest changes
- **Namespace clearly** - `buddy-example/template` vs `local/template`

Teams can maintain separate repos for different purposes:
- Coding standards and style guides
- Project initialization templates
- Common slash commands
- Shared context for code reviews 
