# Infinite Canvas Connector for Windows

The connector installer packages a private Node.js runtime together with `canvas-agent`. Users do not need to install Node.js, npm, MCP, or the workflow Skills themselves.

The Start menu shortcut launches the local Agent in the background and opens the configured hosted canvas with `agentUrl` and `agentToken` in the URL fragment. The web app consumes and removes the fragment before continuing.

## Release build

`.github/workflows/windows-connector.yml` builds the installer on a Windows GitHub runner whenever a version tag is pushed. Set the repository variable `CANVAS_SITE_URL` to the production website origin before building or tagging a connector release. The workflow fails instead of producing an installer that opens the wrong site when this variable is absent.

The unsigned installer is suitable for private testing. Public distribution should sign both the installer and its uninstaller with an organization code-signing certificate to avoid Windows SmartScreen warnings.
