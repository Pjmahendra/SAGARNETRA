# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead: **Security tab → Report a vulnerability** on this repository. Include what you found, how to reproduce it, and the impact you expect.

This is a student hackathon project, so there is no formal SLA, but reports are read and answered as quickly as the team can manage.

## Scope notes

- The demo accounts in the README exist only after you run the local seed script. They are not deployed credentials. Change or remove them before exposing any instance to a network.
- Always set a long random `JWT_SECRET`. The value in `.env.example` is a placeholder.
- Secrets (`.env`, API keys) must never be committed. If you find one in the history, report it.

## What is already in place

- bcrypt (cost 12) password hashing and short-lived JWTs
- Login rate limiting
- Role checks and per-officer sector scoping
- An audit log of sensitive actions
