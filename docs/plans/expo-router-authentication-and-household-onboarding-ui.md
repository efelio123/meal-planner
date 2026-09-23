# Expo Router authentication and household onboarding UI plan

## Goal

Turn the existing Clerk provider wiring into the first usable native flow: a
person can sign up or sign in with an email verification code, create or join a
household, and reopen the app in their most recently selected household. The
FastAPI API remains authoritative for identity, household access, and invitation
acceptance.

## Scope and route structure

Use Expo Router's current `Stack.Protected` support, with a deliberate loading
state while Clerk restores SecureStore-backed session state:

```text
src/app/
  _layout.tsx                 ClerkProvider + root protected stack
  (auth)/sign-in.tsx          custom email-code sign-in
  (auth)/sign-up.tsx          custom email-code sign-up
  (onboarding)/index.tsx      choose create household or enter invitation code
  (onboarding)/create-household.tsx
  (onboarding)/join-household.tsx
  (onboarding)/select-household.tsx
  (app)/index.tsx             temporary signed-in household landing screen
```

- Signed-out users can reach only `(auth)` routes. A direct native deep link to
  another route resolves to the sign-in screen; this is client navigation
  protection, not an authorization substitute.
- A signed-in user first calls `GET /v1/me`, then has exactly one selection
  outcome: **zero households** leads to the create-or-join `(onboarding)`
  choice; **one household** is selected automatically; **multiple households**
  with no valid stored selection lead to `select-household`. An active,
  API-authorized stored selection always leads to `(app)`.
- Do not retain the default Expo tabs as a pretend authenticated experience.
  Replace them with the minimal protected landing route; shared shopping-list
  UI remains a later vertical slice.

## Custom email-code screens

- Build separate native sign-up and sign-in screens using the installed
  `@clerk/expo` 4.6.5 hooks (`useSignUp`, `useSignIn`, `useAuth`, and
  `useClerk`), not hosted browser UI, passwords, magic links, social sign-in,
  or deep links.
- Each screen has an email entry state, code-verification state, loading state,
  resend cooldown, switch-to-other-flow link, and accessible error summary.
  Use Clerk's current custom-flow methods for the exact resolved SDK rather than
  copying older `prepare...` APIs.
- Normalize only presentation/input whitespace locally. Clerk owns sign-up,
  email delivery, code validation, session creation, and brute-force controls.
  Do not show raw Clerk error objects or log verification codes.
- On successful finalization, let Clerk update the session and let the root
  route guard begin the `/v1/me` onboarding decision. Do not manually persist a
  token or a user ID.

## Typed API client

- Add a small mobile API module with TypeScript request/response types for the
  existing `/v1/me`, households, and invitation routes. It is a temporary
  focused client; OpenAPI generation remains the later project-wide client
  decision.
- The request helper receives Clerk's `getToken` function, obtains a fresh
  session token immediately before each request, and sends exactly one
  `Authorization: Bearer` header. It never caches, returns, stores, or logs the
  raw token.
- Parse the configured `EXPO_PUBLIC_API_BASE_URL` once; request callers cannot
  provide an arbitrary base URL. Map non-sensitive API errors to user-facing
  states (unauthorized, offline, invalid invitation, expired invitation,
  duplicate invitation) without exposing backend details.
- `GET /v1/me` is invoked after Clerk state becomes signed in and after an
  invitation acceptance or household creation. The server still provisions a
  local user on every protected route, so call order is never a security
  requirement.

## Household onboarding and selection

- **Create household:** native form for a household name and IANA time-zone
  selection derived from the device's current time zone, with a visible editable
  fallback. Submit `POST /v1/households`; then refresh `/v1/me` and select the
  returned household.
- **Join household:** a manual paste/entry form for the development invitation
  code. Submit the raw code only in the JSON body to `POST /v1/invitations/accept`.
  Never put it in a route, URL, log, error report, or persistent storage.
  Refresh `/v1/me` after success.
- **Most-recent household:** store only a valid household UUID/string key in
  AsyncStorage. On launch, read it after `/v1/me`; accept it only if it appears
  in that API response. With multiple households and no valid selection, show
  `select-household` with the API-returned household names; with exactly one
  household, select it automatically; with zero households, clear it and return
  to create/join onboarding. Never store Clerk session material, email
  addresses, invite codes, roles, or API responses in AsyncStorage.
- Every later household-scoped request includes the selected household ID but
  expects the API to reauthorize membership. A 404/authorization response clears
  the local selection and returns to selection rather than retrying against a
  guessed household.

## Clerk authorized-party configuration and safe testing

- Before real-device testing, create the Clerk Native application and enable
  Native API. Configure `CLERK_AUTHORIZED_PARTIES` on the API with the actual
  `azp` value Clerk issues for that native client; it is not the API LAN URL and
  must not be guessed as `localhost`.
- Bootstrap that value with this controlled development procedure:

  1. Register the chosen iOS bundle identifier and Android package in Clerk's
     **Native applications** configuration, then enable Native API.
  2. In a local, uncommitted, development-only diagnostic helper, call Clerk's
     `getToken()` and decode only the JWT payload in memory to read its `azp`
     claim. The helper must discard the token immediately, never render it,
     never write it to AsyncStorage/files, and never send it anywhere other
     than the normal API request.
  3. If `azp` is present, copy only that non-secret string into the local API
     `CLERK_AUTHORIZED_PARTIES` setting; remove the diagnostic helper before
     committing. Do not add the value to source, screenshots, or issue text.
     If `azp` is absent, do not invent an authorized-party value: Clerk's JWT
     guidance says this validation is skipped for a token without that claim.
     Configure the backend without the `authorized_parties` option for that
     development instance, while retaining all signature, issuer, expiry,
     session-token-type, and audience checks that are configured.
  4. Restart the API and verify a signed-in device receives a sanitized success
     result from `GET /v1/me`. Record only success/failure and the configured
     native identifiers, not any bearer token or decoded payload.

  Configure `CLERK_AUDIENCE` only if a matching Clerk audience has deliberately
  been configured. Add backend boundary tests for both outcomes: an `azp` claim
  that is present and in the configured allow-list is accepted, and an absent
  `azp` claim is accepted only when the SDK is invoked without an
  authorized-parties option. Use mocked Clerk hooks/token functions for
  automated mobile tests.

## Permanent native identity decision before the first development build

Felipe approved this permanent native identity set before the first development
build, Clerk Native registration, or installable distribution:

- iOS `bundleIdentifier`: `com.efelio.mealplanner`
- Android `package`: `com.efelio.mealplanner`
- Expo custom URL `scheme`: `mealplanner`

These identifiers are now in Expo configuration and become the app's durable
identity in Apple/Google tooling, installed builds, Clerk native-app
configuration, and future deep-link routing. Register the identifiers in Clerk
before building. Deep-link invitations remain deferred.

## Validation

- Add component tests with mocked Clerk hooks for sign-up/sign-in states,
  resend/error handling, signed-out routing, and session restoration.
- Unit-test the API request helper: fresh token per request, exactly one Bearer
  header, no token persistence/logging, mapped failures, and fixed base URL.
- Test onboarding forms, invitation-code non-persistence, valid/stale household
  selection, and API-driven removal recovery.
- Run `npm run lint`, then test a development build on a physical iPhone and
  Android device. Verify the intended authorized party using only sanitized
  success/failure results, and verify Android HTTP is limited to the configured
  development variant while iOS uses HTTPS if ATS requires it.

## Explicitly deferred

- Clerk account/Native API setup, credentials, production transport, and cloud
  deployment until Felipe performs the required account/configuration steps.
- Deep-link invitations, email delivery, universal links, social login,
  passwords, account deletion UI, shopping-list UI, recipes, and any general
  offline-sync system.
