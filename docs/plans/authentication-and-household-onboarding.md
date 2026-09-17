# Authentication and household onboarding plan

## Goal

Let a new mobile user securely sign in, become a local `users` record, and
create or join a household without weakening household isolation. This is the
foundation for the first shared-list vertical slice, not a complete account or
household-settings feature.

## Scope and delivery order

1. **Use Clerk as the managed authentication provider.** Before implementation,
   confirm current Clerk Expo and Python/FastAPI documentation for the resolved
   SDK versions. Configure the product for passwordless email verification codes
   only; do not enable password, magic-link, or social sign-in in this slice.
2. **Verify provider tokens in the API.** Add a small authentication boundary
   that validates issuer, audience, expiry, signature/JWKS, and required subject
   claims. It returns a `CurrentUser` context and sends `401` for missing or
   invalid credentials. Do not accept a client-supplied user ID, household ID,
   email, or role as authority.
3. **Provision users idempotently.** On a valid provider identity, create or
   load the local user using the existing unique
   `(identity_provider, identity_subject)` key. Concurrent first sign-ins must
   handle that unique constraint safely and return the same local user. A user
   with `deleted_at IS NOT NULL` must never silently reactivate on sign-in. Only
   provider-verified email and display-name data may populate the local record;
   update a changed verified email only when it does not conflict with another
   active local user.
4. **Add household onboarding API operations.**
   - Read the signed-in user's onboarding state and accessible households.
   - Create a household with name and valid IANA time zone.
   - In one transaction, create the household and its first active `owner`
     membership; failure leaves neither a partial household nor a membership.
   - Select/return a household only after checking active membership. An active
     household preference can remain client-side until a server-side need exists.
5. **Add development-only invitation-code joining.** Only an active `owner`
   creates or revokes an invitation. The v1 API always creates a `member`
   invitation; the database's `owner` role remains reserved for a future
   feature. Return a copyable invitation code to the owner; do not send email or
   configure deep links. An authenticated invite recipient manually enters the
   code, and the signed-in user's Clerk-verified, normalized email must match
   the invitation's normalized email. Its raw token is generated once, delivered
   outside the database, and only its digest is stored. Acceptance verifies the
   token and expiry, transitions stale pending invitations to `expired`
   transactionally, creates or reactivates membership, and marks the invitation
   accepted in one transaction. Send the raw token only in the body of
   `POST /v1/invitations/accept`, never in a route parameter or logs.
6. **Add the mobile onboarding flow.** After a managed-auth session is present,
   retrieve the onboarding state. Show create-household when the user has none;
   for development-only invitations, let the user manually paste or enter a
   copyable invitation code. Persist the most recently selected household only
   on the device, and always let the API reauthorize it using active membership.
   Defer deep-link joining until a supported link-delivery method and its
   configuration are intentionally added; otherwise enter the household-scoped
   app. Store only provider session material in Expo SecureStore, never in
   AsyncStorage or source control.

## API and authorization design

- Keep routes under `/v1`, with small route, service, and repository modules.
  Proposed operations are `GET /v1/me`, `GET`/`POST /v1/households`, owner-only
  invitation create/revoke operations, and recipient-authenticated invitation
  acceptance. Exact request/response shapes will be reviewed with the chosen
  provider and generated OpenAPI client.
- Token validation obtains the issuer, audience, algorithm allowlist, and JWKS
  endpoint from trusted provider configuration, never token-controlled fields.
  Reject unknown key IDs, invalid algorithms, and issuer/audience mismatches.
- Authentication establishes the user; household membership establishes tenant
  access. Every household lookup or mutation uses the authenticated user plus
  `household_id` and `removed_at IS NULL` membership. A membership's
  `created_by` or an invitation's creator is audit data, not permission.
- Owners may create/revoke invitations and manage household membership; members
  can use shared household data. Existing-member removal/demotion, including the
  last-active-owner invariant, belongs to a later membership-management feature.
- Return a consistent non-sensitive not-found/forbidden response for
  cross-household resource guesses. This work establishes the authorization
  helper; later catalog, recipe, plan, and list endpoints must use it.
- Do not implement PostgreSQL RLS in this slice. It remains possible defense in
  depth after application authorization and tenant-isolation tests are proven.

## Data and migration implications

- Reuse `users`, `households`, `household_members`, and
  `household_invitations` from `identity_and_households`; do not recreate or
  loosen their canonical-email, lifecycle, partial-index, or restrictive-FK
  constraints.
- A follow-up migration is allowed only if implementation reveals a missing
  field needed for the approved flow (for example, invitation acceptance actor
  audit). It must be handwritten, reviewed, and tested; no product tables are
  included.
- Treat all invitation tokens and provider credentials as secrets. Store only a
  strong one-way invitation-token digest, compare it safely, and never log raw
  tokens, bearer tokens, authorization headers, or provider responses.

## Validation

- Unit-test token claim validation with a provider/JWKS test double; include
  invalid issuer, audience, signature, expiry, and missing subject cases.
- Integration-test idempotent user provisioning; household-and-owner creation
  atomicity; invitation pending/expired/accepted/revoked behavior; membership
  reactivation; verified-email matching; changed-email conflict handling; and
  concurrent first-sign-in behavior.
- Add tenant-isolation tests in which a user from household A cannot list,
  create against, or mutate household B through any onboarding/invitation route.
- Test mobile session restoration, signed-out state, create-household flow, and
  invitation join/error states with the provider SDK mocked.
- Run API tests, Ruff, mobile lint, relevant device/development-build checks,
  and `git diff --check`. Verify all new dependencies against current official
  documentation and their resolved project versions before implementation.

## Explicitly deferred

- Building password storage, password reset, email verification, refresh-token
  rotation, or brute-force protection ourselves.
- Clerk account creation, SDK installation, provider configuration, secrets, and
  cloud/staging deployment.
- Transactional email delivery, invitation email templates, universal-link
  hosting, Apple/Google social login, account/household deletion execution, and
  existing-member removal/demotion or last-owner enforcement.
- Catalog, recipes, meal planning, shopping lists, RLS, billing, and all other
  product features.

## Approved product decisions

- Identity provider: Clerk.
- Initial sign-in: passwordless email verification codes only.
- Invitation delivery: development-only copyable invitation codes.
- Multiple households: device-local most-recent selection, always reauthorized
  by the API.
