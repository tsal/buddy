# buddy

A simple, early-stage project (version 0.0.1) designed as a foundation for future development.

## Usage

To run buddy, currently use:

```bash
bun run src/index.ts
```

> **Note:** The build process and distribution workflow are not yet implemented. Please use the above command to run buddy during this stage, and replace usages of `buddy` down below.

Currently supports: 

- stashing - `buddy add -p some-claude-project-subagent` or directly with `buddy add some/path/to/agent-name` (note the lack of .md, it is assumed)
- cloning - `buddy add https://github.com/some/git-repo.git`
- re-use - in a project that uses Claude: `buddy import -p git-repo/some/agent-name` and it will add it to your .claude configuration;
  - you can run without -p to just copy the agent file to the current working directory
  - you can use stashed ones as well - `buddy import -p local/some-claude-project-subagent` for the first example (with claude), `buddy import local/agent-name` for the second (without claude)

## TODO

- [ ] Implement build process
- [ ] Add proper git repository management/documentation for exporting
