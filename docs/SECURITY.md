# Security and Public/Private Boundary

MacroLens uses a public/private architecture.

## Public repository

This repository contains:

- the dashboard;
- documentation;
- a sanitized JSON output contract;
- no API credentials.

## Private engine

API keys, authenticated data access and the complete calculation implementation are kept outside the public repository.

Credentials are supplied through environment variables and `.env` is excluded from version control.

## Reporting

If a credential or private implementation detail is ever committed accidentally, the correct response is to rotate the credential immediately and remove the exposed material from repository history where appropriate.
