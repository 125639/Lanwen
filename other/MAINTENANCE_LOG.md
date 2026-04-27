# Maintenance Log

## 2026-04-26 Connectivity and Proxy Audit

1. Checked running services and found no active Vite/Node process for the app.
2. Ran `npm run build` to verify the current code could produce a valid `dist/` bundle.
3. Restarted the development stack with `npm run dev`.
4. Verified the app entry returned `200 OK` at `http://127.0.0.1:4173/`.
5. Verified the Express entry returned `200 OK` at `http://127.0.0.1:8770/`.
6. Fixed `ecosystem.config.cjs` so PM2 uses the config file directory as `cwd` instead of the stale `/root/english` path.
7. Fixed `ecosystem.config.cjs` log paths to resolve under the actual app root.
8. Set the PM2 production environment to `HOST=0.0.0.0` and `PORT=8770` to match the app scripts.
9. Scanned source, config, and docs for stale backend-port references.
10. Updated `src/apiBase.ts` so the frontend uses same-origin `/api` in Vite dev and production, instead of directly calling a separate backend port.
11. Updated `src/api.ts` connection-test copy to remove stale port-specific guidance.
12. Updated `vite.config.ts` so `/api` proxies to `http://127.0.0.1:8770`.
13. Updated `vite.config.ts` to strip the browser `Origin` header before forwarding Vite proxy requests to Express, preventing dev-only CORS false positives.
14. Updated `AGENTS.md` port documentation to `8770`.
15. Updated `CLAUDE.md` port documentation to `8770`.
16. Reproduced the LLM test failure and found the backend error was `fetch failed` caused by `ERR_INVALID_IP_ADDRESS`.
17. Checked SiliconFlow DNS and HTTPS reachability outside the sandbox to confirm the external service was reachable.
18. Fixed `server/index.js` `safeLookup()` to honor Node/Undici lookup callback shapes for both single-address and `all: true` lookups.
19. Hardened `safeLookup()` against empty or invalid DNS responses so it returns a clear DNS error instead of passing `undefined` as an IP address.
20. Verified `/api/llm/test` with a fake API key reaches SiliconFlow and returns `401 Invalid token`, proving the local proxy path no longer fails with `fetch failed`.
21. Audited related proxy/CORS/DNS/fetch code paths for similar failures.
22. Added same-origin Host/Origin allowance in `server/index.js` so production access by IP or domain can call `/api` without needing every host prelisted in `CORS_ALLOW_ORIGINS`.
23. Kept non-same-origin API requests blocked; verified mismatched Origin/Host still returns `403 Origin not allowed`.
24. Added `getErrorMessage()` in `server/index.js` to preserve nested `Error.cause` details from network, DNS, and TLS failures.
25. Updated LLM test, OCR test, OCR extraction, reading generation, chat, extraction streaming, sentence evaluation, lookup, and TTS catch paths to use `getErrorMessage()`.
26. Hardened LLM stream-reading and JSON-parse logging so non-`Error` throws do not cause secondary crashes.
27. Re-ran static scans to confirm no stale backend-port references, old `fetch failed` guidance, or unsafe backend `e.message` reads remain in the audited paths.
28. Verified same-origin direct API requests return `200 OK`.
29. Verified mismatched cross-origin API requests return `403 Forbidden`.
30. Verified Vite proxied `/api/health` with a browser-like Origin returns `200 OK`.
31. Ran `node --check server/index.js`; it passed.
32. Ran `npm run lint`; it passed.
33. Ran `npm run build`; it passed.

## 2026-04-26 Extra File Cleanup

1. Listed the working tree with `git status --short --untracked-files=all`.
2. Listed shallow project files with `find . -maxdepth 2`, excluding `node_modules`, `.git`, and `dist`.
3. Listed untracked, non-ignored files with `git ls-files --others --exclude-standard`.
4. Checked references for untracked candidates with `rg`.
5. Kept `src/browser.ts` in place because `src/App.tsx`, `src/main.tsx`, `src/settings.ts`, and `src/components/SettingsPanel.tsx` import it.
6. Kept `Dockerfile` and `.dockerignore` in place because they are deployment configuration, not temporary clutter.
7. Created `/root/english/test/other`.
8. Moved `MAINTENANCE_LOG.md` to `other/MAINTENANCE_LOG.md`.
9. Moved `picture/屏幕截图 2026-04-23 214243.png` to `other/屏幕截图 2026-04-23 214243.png`.
