# SignWell for Claude

Send documents for signature, check who has signed, and download completed contracts, all from a conversation with Claude. Works with your existing SignWell account and templates.

## What you can do

- **Send a document for signature.** Attach a PDF or Word file, name the signers, and Claude creates and sends it. Fields can come from your text tags or a SignWell template.
- **Use your templates.** Send an NDA, proposal, or agreement from a template you already have, filling in the signer details in plain language.
- **Check status.** Ask who has signed, who is still pending, and when a document was viewed.
- **Send reminders and fix recipients.** Nudge a signer or correct an email address without opening SignWell.
- **Download completed documents.** Get the signed PDF once everyone has signed.
- **Manage templates.** List, inspect, update, or delete the templates in your account.

Documents are created as drafts by default, so you can review before anything goes out. Use SignWell test mode while you are trying things out and nothing will be sent to real signers.

## Setup

1. Add the plugin. Claude asks for your **SignWell API key**, which you can find in your SignWell account under **Settings > API**. The key is stored in your system's secure credential store, not in a file.
2. Start a conversation: *"Send the attached contract to jane@example.com for signature."*

You need a SignWell account. Plans that include API access are listed at [signwell.com/pricing](https://www.signwell.com/pricing/).

## How it works

This plugin runs the open-source SignWell MCP server, published on npm as [`@signwell/mcp`](https://www.npmjs.com/package/@signwell/mcp), on your machine over stdio. The only network destination is SignWell's API at `https://www.signwell.com/api/v1`, called with your API key. Source code is at [github.com/Bidsketch/signwell-mcp](https://github.com/Bidsketch/signwell-mcp), and setup instructions for Claude Desktop, Claude Code, and Cursor are at [signwell.com/mcp](https://www.signwell.com/mcp/).

## Privacy Policy

- **Data collection.** The plugin does not collect, transmit, or store personal data, usage analytics, or telemetry.
- **Usage and storage.** Files you attach are held in memory for up to 60 minutes while a document is being created, then cleared. Nothing is written to disk other than the API key, which lives in your platform's secure credential store.
- **Third-party sharing.** No data is shared with third parties. All requests go directly from your machine to SignWell's servers.
- **Data retention.** Nothing is retained beyond the in-memory file cache described above.
- **Contact.** [support@signwell.com](mailto:support@signwell.com), or open an issue at [github.com/Bidsketch/signwell-mcp/issues](https://github.com/Bidsketch/signwell-mcp/issues).

SignWell's full privacy policy: [https://www.signwell.com/privacy/](https://www.signwell.com/privacy/).

## Support

Questions or problems: [support@signwell.com](mailto:support@signwell.com).
