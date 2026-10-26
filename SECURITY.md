# Security Policy

## Supported versions

Only the latest release, built from the `main` branch, receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab, choose **Advisories**, then **Report a vulnerability**, or go directly to:

https://github.com/Tektrix/pinfold/security/advisories/new

Do not open a public issue, pull request or discussion for a security problem until a fix is released.

Include:

- What the issue is and what an attacker could do with it.
- Steps to reproduce, with a proof of concept if you have one (for example a crafted page title, URL or import file).
- The Pinfold version or commit, and your browser and version.
- Any suggested fix.

## What to expect

Pinfold is maintained by volunteers, so responses are best effort. We aim to acknowledge a report within a week, keep you updated as we investigate, and credit you in the advisory and release notes unless you prefer otherwise.

## Scope

In scope, for example:

- Script injection (XSS) in the dashboard, popup or options pages, such as through tab titles, URLs, folder names or imported data.
- Any way that saved tabs, settings or previews leave the device without the user choosing to export them.
- Crafted OneTab, Markdown or JSON import files that inject script, smuggle unsafe URLs (such as `javascript:` or `data:`) past the URL checks, or corrupt stored data.
- Misuse of permissions, such as the optional all-sites permission being requested or used for anything other than page previews.
- Bypasses of the Content Security Policy in `manifest.json`.

Out of scope, for example:

- Attacks that require a malicious extension, malware or an attacker who already has access to the user's browser profile or device.
- Data the user exported themselves (clipboard or downloaded files) being read by other software.
- Bugs in Chrome, Edge, Brave or other browsers themselves. Report those to the browser vendor.
- Reports from automated scanners without a working proof of concept.
