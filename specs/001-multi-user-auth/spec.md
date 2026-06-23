# Feature Specification: Multi-User Accounts & Per-User Data Isolation

**Feature Branch**: `001-multi-user-auth`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "Quero fazer o deploy desse projeto (comprar um domínio ou mesmo disponibilizar localmente) mas para isso precisamos implementar um fluxo de login (ou algo parecido) para conseguir separar as conversas e ingestões de cada usuário"

## Summary

dIAlogus is currently a single-user study companion: there is one global library
of classics and one undivided stream of conversations, with no notion of "who"
is using the app. To deploy it — whether on a public domain or shared locally —
the product must become multi-user: each person signs in and gets a private
workspace where their conversations and their library are theirs alone, while
the expensive, public-domain reading corpus is ingested once and reused across
everyone. Access is invite-only so the owner controls who can join and what it
costs to run.

This feature delivers the authentication and per-user data isolation that make a
safe deployment possible. The act of provisioning hosting and a domain is the
motivation but is not part of this feature's scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and converse in a private space (Priority: P1)

An authorized person opens the deployed app, signs in, and lands in a chat
workspace that contains only their own conversations. They can start new
threads, continue past ones, rename and pin them — and none of this is ever
visible to, or affected by, any other user. When they are done they sign out,
and the workspace is locked again behind authentication.

**Why this priority**: This is the heart of the request — "separar as conversas
de cada usuário". Without authenticated, isolated conversations the app cannot
be exposed to more than one person at all. It is the smallest slice that turns a
single-user tool into a shareable one.

**Independent Test**: With two authorized accounts, sign in as User A, create and
name a thread, sign out, sign in as User B — User B sees an empty conversation
list and cannot reach User A's thread by any means (navigation, direct link, or
search). Delivers the core value of private, per-user conversations.

**Acceptance Scenarios**:

1. **Given** an authorized person who is not signed in, **When** they open any
   app page, **Then** they are required to authenticate before any conversation,
   library, or ingestion surface is shown.
2. **Given** a signed-in user with existing threads, **When** they open the chat
   workspace, **Then** they see only their own threads, in their own order, with
   their own pins and titles.
3. **Given** User A's thread, **When** User B (signed in) attempts to open it via
   a direct link or identifier, **Then** access is denied and no content from
   User A's thread is revealed.
4. **Given** a signed-in user, **When** they sign out, **Then** their session
   ends and returning to any app page again requires authentication.

---

### User Story 2 - Maintain a personal library over a shared corpus (Priority: P1)

A signed-in user browses public-domain classics, adds the ones they want to
their own library, and starts (or continues) ingestion so they can ask grounded
questions about them. They see only the books they added. When they add a title
that someone else has already ingested, it becomes available to them
immediately, with no waiting and no duplicate processing. Removing a book from
their library affects only their library.

**Why this priority**: This is the other half of the request — "separar as
ingestões de cada usuário". It is what lets each person curate their own reading
list while keeping the cost of the system bounded, because the heavy ingestion
of a given public-domain text happens only once for everyone.

**Independent Test**: As User A, add and fully ingest a title. As User B, add the
same title — confirm it appears in User B's library as ready within seconds and
no new ingestion pipeline runs. Confirm User A's library still shows only User
A's chosen books and User B's only User B's, even though both reference the same
underlying text.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they view their library, **Then** they
   see only the books they personally added, with the ingestion/readiness status
   relevant to them.
2. **Given** a title that has never been ingested, **When** a user adds it,
   **Then** ingestion runs once and the user can ask grounded questions once it
   is ready.
3. **Given** a title already ingested for another user, **When** a new user adds
   it, **Then** it becomes available to them without re-running download, parse,
   chunk, summarize, embed, or index, and without additional ingestion cost.
4. **Given** two users who both have a title in their libraries, **When** one of
   them removes it from their library, **Then** only that user's library entry is
   removed and the shared ingested content remains intact and usable by the
   other.
5. **Given** a user asking a question about one of their books, **When** the
   answer is produced, **Then** citations resolve correctly and the per-book
   spoiler boundary and grounded-refusal behavior apply to that user's settings.

---

### User Story 3 - Invite-only onboarding controlled by the owner (Priority: P2)

The owner decides who is allowed in. They authorize a person — by inviting an
email address or adding it to an allowlist — and only then can that person create
an account and sign in. People who were never authorized cannot create accounts,
no matter how they reach the app. The owner can later revoke someone's access.

**Why this priority**: A publicly reachable deployment that anyone could join
would expose the owner to abuse and to uncontrolled LLM/ingestion cost.
Invite-only onboarding is what makes deploying to a domain safe, but the app is
already useful for the initial authorized users before this control is fully
fleshed out, so it ranks just below the core isolation stories.

**Independent Test**: Authorize a new email, complete account creation as that
person, confirm they can sign in. Then attempt account creation with a
non-authorized email and confirm it is rejected. Revoke an active user's access
and confirm they can no longer sign in or reach any data.

**Acceptance Scenarios**:

1. **Given** the owner, **When** they authorize a person's identifier (invite or
   allowlist), **Then** that person — and only that person — can create an
   account tied to that identifier.
2. **Given** a non-authorized person, **When** they attempt to create an account
   or otherwise gain access, **Then** the attempt is rejected and recorded.
3. **Given** an active user, **When** the owner revokes their access, **Then** the
   user can no longer sign in, and any active session is invalidated.
4. **Given** an authorization that has expired or was already used, **When**
   someone tries to reuse it, **Then** it is rejected.

---

### User Story 4 - Account and session management (Priority: P2)

A user can manage their own access over time: stay signed in across visits and
devices, sign out, recover access if they forget how to sign in, and have their
session expire safely after a period so an abandoned device does not leave their
workspace open.

**Why this priority**: Once multiple people rely on the app daily, the basic
hygiene of sessions and account recovery becomes necessary to keep access both
convenient and safe. It is not needed to prove the isolation concept, so it sits
below the onboarding control.

**Independent Test**: Sign in on two devices and confirm both work
independently; let a session pass its expiry and confirm re-authentication is
required; complete a "forgot how to sign in" recovery flow and regain access.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** their session passes its inactivity or
   maximum-age limit, **Then** they are required to authenticate again before
   continuing.
2. **Given** a user who cannot sign in, **When** they request recovery for their
   authorized identifier, **Then** they receive a means to regain access that
   expires and cannot be reused.
3. **Given** a user signed in on multiple devices, **When** they use the app on
   each, **Then** each device has an independent session and signing out of one
   does not silently break the others.
4. **Given** a user mid-conversation, **When** their session expires, **Then**
   they are guided to re-authenticate without losing the workspace context they
   return to.

### Edge Cases

- **Concurrent first ingestion**: two users add the same not-yet-ingested title
  at nearly the same moment — ingestion must run exactly once and both libraries
  must end up referencing the same ready content (no duplicate pipelines, no
  race that ingests twice).
- **Shared-content removal**: a user removes a title still in another user's
  library, or an account is deleted — the shared ingested corpus must not be
  destroyed while any user still references it.
- **Account deletion / deactivation**: a user's private data (their
  conversations, library membership, preferences) must be removed or anonymized,
  while the shared corpus is untouched and other users are unaffected.
- **Re-invite / duplicate authorization**: authorizing an identifier that already
  has an account, or re-issuing an invitation, must not create a second account
  or silently overwrite the existing one.
- **Unauthorized access attempt**: someone who was never invited tries to
  register, reuse another person's invite, or reach data by guessing
  identifiers — must be denied and recorded.
- **Session expiry mid-task**: a session expires while the user is reading or
  typing — they must be able to re-authenticate and return to the same place.
- **Per-account preferences across devices**: spoiler boundaries set by a user on
  one device must apply on their other devices (they belong to the account, not
  the browser).
- **Failed-login pressure / cost abuse**: repeated failed sign-ins, or a single
  account triggering many concurrent ingestions, must be limited so a deployed
  instance cannot be driven into runaway cost or lockout of others.
- **Last-owner safeguard**: the owner must not be able to lock themselves out by
  revoking the only administrative access.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & identity**

- **FR-001**: System MUST require successful authentication before exposing any
  conversation, library, ingestion, or preference surface.
- **FR-002**: System MUST associate every conversation, library entry, ingestion
  request, and preference with the user who owns it.
- **FR-003**: System MUST allow an authorized person to create exactly one
  account bound to a unique identifier, and MUST authenticate returning users and
  establish a protected session.
- **FR-004**: System MUST let a signed-in user sign out, ending their session on
  that device.
- **FR-005**: System MUST store user credentials and authorization secrets using
  industry-standard protection (never in plain text) and MUST record
  security-relevant events (account creation, sign-in, failed sign-in, access
  revocation).

**Per-user isolation**

- **FR-006**: Each user MUST see only their own conversations; one user MUST NOT
  be able to view, continue, rename, pin, or delete another user's conversation
  by any means, including direct identifiers.
- **FR-007**: Each user MUST see only the books in their own library and the
  readiness status relevant to them; one user MUST NOT see another user's library
  composition.
- **FR-008**: Citation resolution, the per-book spoiler boundary, grounded
  refusal on empty retrieval, and language-matching MUST remain correct and
  scoped to the requesting user's own books and settings.
- **FR-009**: Per-user preferences (including per-book spoiler boundaries) MUST be
  stored with the account so they apply consistently across that user's devices.

**Shared corpus over per-user library**

- **FR-010**: The ingested content of a given public-domain title (downloaded
  text, chapters, chunks, embeddings, summaries) MUST be processed once and
  reused across all users who add that title.
- **FR-011**: Adding a title that is already ingested MUST make it available to
  the requesting user without re-running any ingestion stage and without
  incurring additional ingestion cost.
- **FR-012**: When the same not-yet-ingested title is added by more than one user,
  the ingestion pipeline MUST run exactly once and both users MUST end up
  referencing the same ready content.
- **FR-013**: Removing a title from a user's library MUST remove only that user's
  library entry and MUST NOT destroy shared ingested content still referenced by
  another user.

**Onboarding & access control (invite-only)**

- **FR-014**: System MUST restrict account creation to identifiers the owner has
  explicitly authorized (invitation or allowlist); self-service creation by
  unauthorized identifiers MUST be rejected and recorded.
- **FR-015**: The owner MUST be able to authorize new people, see who currently
  has access, and revoke access; revocation MUST prevent future sign-in and
  invalidate active sessions for that user.
- **FR-016**: An authorization (invite/allowlist entry) MUST be single-account and
  MUST support expiry; reusing an expired or already-consumed authorization MUST
  be rejected.
- **FR-017**: System MUST distinguish at least two roles — an owner/administrator
  who manages access, and a regular member — and MUST prevent the last
  administrator from removing their own administrative access.

**Account lifecycle & sessions**

- **FR-018**: System MUST expire sessions after a defined inactivity period and/or
  maximum age, requiring re-authentication, while preserving the user's workspace
  context on return.
- **FR-019**: System MUST provide a self-service recovery path for a user who
  cannot sign in, using a time-limited, single-use mechanism tied to their
  authorized identifier.
- **FR-020**: System MUST allow a user to be signed in on multiple devices with
  independent sessions.

**Abuse & cost protection**

- **FR-021**: System MUST limit authentication abuse (e.g., rate-limit or back off
  repeated failed sign-ins) and MUST bound a single user's concurrent ingestions
  so one account cannot drive the deployed instance into runaway cost or deny
  service to others.

**Data lifecycle**

- **FR-022**: The first multi-user deployment is NOT required to migrate or
  preserve pre-existing single-user data; the system MAY start from a clean
  multi-user state. Any leftover pre-existing conversations or library entries
  carry no ownership and MUST NOT become visible to newly created users.
- **FR-023**: Deleting or deactivating an account MUST remove or anonymize that
  user's private data (conversations, library membership, preferences) without
  affecting the shared corpus or other users.

### Key Entities *(include if feature involves data)*

- **User Account**: A person authorized to use the app. Has a unique identifier
  (email), protected credentials, a role (owner/administrator or member), and a
  status (active, revoked). Owns conversations, a library, and preferences.
- **Authorization (Invitation / Allowlist Entry)**: A record that a specific
  identifier is permitted to create an account. Tracks who issued it, its status
  (pending, used, expired, revoked), and an expiry. Consumable by exactly one
  account.
- **Session**: An authenticated, time-bounded association between a user and a
  device. Has an expiry; can be ended by sign-out or revocation.
- **Library Entry (per-user)**: The link between a user and a title they have
  added — the per-user view over the shared catalog, carrying the readiness the
  user sees. Removing it does not remove the underlying title's content.
- **Book / Shared Corpus (existing)**: A public-domain title and its ingested
  artifacts (chapters, chunks, embeddings, summaries), now shared across users and
  ingested once per title.
- **Conversation / Thread (existing)**: A chat thread, now owned by exactly one
  user and visible only to that user; retains titles, pins, and message history.
- **User Preference**: Account-scoped settings, notably per-book spoiler
  boundaries, applied across the user's devices.
- **Security Event (audit)**: A recorded account/access event (creation, sign-in,
  failed sign-in, revocation) used for accountability and abuse detection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning authorized user can authenticate and reach their private
  workspace in at most 3 steps and under 5 seconds.
- **SC-002**: Zero cross-user data leakage: across all access attempts, a user can
  reach only their own conversations, library, and preferences — no other user's
  data is ever returned, including via direct identifiers.
- **SC-003**: A title already present in the shared corpus becomes available to a
  new user in under 5 seconds, versus the multi-minute first-time ingestion.
- **SC-004**: Adding an already-ingested title for an additional user incurs no
  additional ingestion processing (no repeated download, embedding, or indexing).
- **SC-005**: 100% of account creations originate from authorized identifiers;
  unauthorized creation attempts are rejected and recorded.
- **SC-006**: The deployed instance supports the owner plus at least 10
  concurrent users with no cross-user visibility and no perceptible degradation
  of chat streaming.
- **SC-007**: An owner can grant or revoke a person's access in under 1 minute,
  and a revoked user can no longer sign in or reach any data on their next
  attempt.
- **SC-008**: A user's spoiler boundary set on one device is reflected on their
  other devices on next sign-in (preferences are account-scoped, not
  device-scoped).

## Assumptions

- **Authentication method**: Email plus password with secure, server-side
  sessions is the default for v1 (standard for web apps). Social sign-in
  (OAuth) and passwordless/magic-link are possible future enhancements and are
  out of scope here.
- **Provisioning model**: Account creation is invite-only / allowlist-based, per
  the product decision; there is no open public self-registration in v1.
- **Corpus model**: The reading corpus is shared and ingested once per
  public-domain title; each user has an independent library (membership) and
  independent conversations layered over that shared corpus.
- **Existing data**: The first multi-user deployment does not migrate or preserve
  the current single-user library or conversation history; it may start from a
  clean multi-user state (the owner's existing data is not carried over).
- **Preferences**: Spoiler boundaries move from per-device browser storage to
  account-scoped storage so they follow the user.
- **Roles**: At minimum an owner/administrator role (manages the allowlist and
  access) and a regular member role; richer role hierarchies are out of scope.
- **Email capability**: Invitations and account-recovery messages assume an
  email-sending capability is available; its selection is a planning concern.
- **Consistency baseline**: Authentication and account UI follow the existing
  design system, language behavior (PT/EN), error-contract, and accessibility
  baselines already required by the project.
- **Scale**: The target is a personal/shared deployment (owner plus a small
  number of invited users), not a large public service.

## Out of Scope

- Provisioning the deployment itself (purchasing a domain, hosting, TLS, CI/CD,
  backups). This feature delivers the auth and isolation that make a deployment
  safe; the infrastructure work is separate.
- Migrating or preserving the existing single-user library and conversation
  history into the multi-user deployment; the first deploy may start fresh.
- Open public self-registration and the heavier anti-abuse, email-verification,
  and quota machinery it would require.
- Billing, subscriptions, or usage-based metering.
- Sharing conversations or libraries between users, team/shared workspaces, and
  collaborative threads.
- Enterprise SSO/SAML and organization/tenant hierarchies.

## Dependencies

- An email-delivery capability for invitations and account recovery.
- The existing single Postgres datastore, extended to hold identity, sessions,
  authorizations, per-user library membership, and preferences (the project's
  single-datastore constraint applies).
