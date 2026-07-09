# XiYouQuest — HKUST OIDC Redirect URIs

**App:** XiYouQuest / PCSWebTool (Next.js, Better Auth self-hosted).
**Entra app (staff tenant):** client `ce4cb5e3-47d6-4b1c-87cc-e83fc7cabb29`,
tenant `c917f3e2-9322-4926-9bb3-daca730413ca` (shared with CLE-Meli).
**Discovery URL:** `https://login.microsoftonline.com/c917f3e2-9322-4926-9bb3-daca730413ca/v2.0/.well-known/openid-configuration`

## Callback pattern (Better Auth 1.6.x generic-oauth)

```
{origin}/api/auth/oauth2/callback/{providerId}
```

Verified against better-auth installed source + docs in the Meli repo
(`cle/docs/oidc-redirect-uris.md`) — same library, same basePath default.

## providerId decision: `hkust`

- **providerId = `hkust`** → callback `.../api/auth/oauth2/callback/hkust`.
- Rationale: CLE/ITSO registered the sibling Meli app with `.../callback/hkust`
  (confirmed by email 2026-07 and a working production login). Both apps were
  registered in the same ITSO batch; per project owner's decision (2026-07-10)
  XiYouQuest assumes the same pattern.
- **Probe caveat:** direct authorize-endpoint probing cannot confirm the
  registered URI — Entra (as of 2026-07) renders the sign-in page for ANY
  redirect_uri, including known-bogus controls, and only validates after
  username entry. Confirmation therefore comes from the first real sign-in:
  an `AADSTS50011` there means the registered path differs — ask CLE/ITSO to
  align on the URIs below.

## Redirect URIs assumed registered (ask ITSO to confirm/align)

| Env   | Redirect URI |
|-------|--------------|
| Prod  | `https://cle-xyq.hkust.edu.hk/api/auth/oauth2/callback/hkust` |
| Dev   | `https://cle-xyq-dev.hkust.edu.hk/api/auth/oauth2/callback/hkust` |
| Local | `http://localhost:3000/api/auth/oauth2/callback/hkust` (Meli lesson: ITSO may have registered only the bare origin — local SSO then fails until the full path is added; does not affect prod/dev) |

## Known external gates

- `AADSTS50105` (assignment required): ITSO must assign pilot users/groups to
  the XYQ app, same as they did for Meli.
- Client secret: issued by ITSO (expires 2028-06-28); stored only in env vars.
