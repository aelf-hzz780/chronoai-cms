**Blogging platform — requirements**

Version 0.7 · 28 October 2026 · CMS and NyxID service access for personal and organization publishing

Build a standalone bilingual blogging platform where people can **publish as themselves or on behalf of an organization**. Use self-hosted open-source [Ghost](https://github.com/TryGhost/Ghost) for public blogs. Users must be able to manage content through its browser CMS and through a registered NyxID service.

These are the required product outcomes. The [expected deliverables](#file-supporting-deliverables-md) describe what must be handed over and demonstrated. This is a specification, not a claim that the service has been built.

**1. Provide a standalone CMS with NyxID sign-in**

Run the platform at its own URL, with **“Sign in with NyxID”** through OAuth/OpenID Connect. Use ORNN, Aevatar and CMA as references for the experience and reuse supported integration patterns where applicable. Opening the CMS directly or from NyxID must lead to the same account and workspaces.

NyxID handles authentication and account recovery. The platform manages content and publishing permissions. Separate local login and continued authenticated use during a NyxID outage are outside these requirements.

Run open-source Ghost on infrastructure we control, without requiring Ghost(Pro). The CMS means the user-facing publishing interface; Ghost administration remains for trusted operators. Hosting, maintenance and paid destination subscriptions must have an identified payer.

**2. Make the platform usable as a NyxID service**

Register the platform as a service in NyxID and provide documented operations for these actions:

| Action | What users must be able to do through NyxID |
| --- | --- |
| Read | List, search and retrieve posts, authorized drafts, metadata and publication status. |
| Manage content | Create and edit personal posts and organization drafts, and submit organization drafts for publication. |
| Publish | Publish, update and unpublish personal content or authorized organization content. Request external distribution where supported. |
| Get Markdown files | Retrieve the original English or Chinese `.md` file for an authorized draft or published version, preserving the source. |
| Get metrics | Retrieve the same article and workspace metrics available in the CMS, including filters, data availability and update times. |

These operations must use the same content, ownership and permission rules as the CMS. Users must not have to reopen the CMS to complete an otherwise authorized NyxID service operation. A publishing request through NyxID can provide the user's confirmation of the content and destination; NyxID's applicable execution approvals still apply.

**3. Keep personal posts and organization posts distinct**

Every user, including an organization member, can manage and publish their own personally owned posts in their own capacity through either the CMS or NyxID. This does not require organization publishing permission. Personal publishing must also work for users who do not belong to an organization.

Users choose **“Publish as myself”** or **“Publish as [organization]”**. Each owner has separate content and destinations. An organization post may credit an individual author while remaining owned by the organization; a personal byline does not grant control of an organization channel.

A person may belong to several organizations. Leaving one removes access to that organization's content and channels, while their personal posts remain theirs and organization posts remain with the organization. Organization Admin status does not grant access to members' private personal drafts or metrics.

**4. Let members draft; restrict organization-channel publishing**

Every active organization member can create and manage their own drafts for the organization and submit them for publication. **Organization Admins and members assigned a designated publishing role can publish to organization channels.** Admins manage that role or “Can publish” permission. Organization channels include the organization's Ghost publications and connected external destinations.

Ordinary members cannot publish, update live content or unpublish on organization channels, even when they authored the draft. They can continue working on a draft revision. An Admin or designated publisher can publish their own or submitted organization drafts without a separate Editor or mandatory second-person review.

The publishing action confirms the version, credited author, owner and destinations in either the CMS or NyxID service. Draft edits must not silently change live content. Check current membership and publishing authority for every operation and again before queued actions run; removal of that authority blocks pending actions. The service must enforce these rules even when a caller changes an owner or channel identifier.

**5. Write and maintain English and Chinese Markdown**

Users must be able to create, edit, import, export and privately preview Markdown articles in English and Chinese. Simplified Chinese is the proposed initial Chinese variant. Original Markdown must remain available through both the CMS and NyxID service without losing content when Ghost formats it for the public site.

Support ordinary article formatting, code blocks, tables, links and images, with revision history and protection against conflicting edits. Translations are linked but published independently. Changing the source should flag an outdated translation without silently replacing it. Markdown retrieval must respect the same access rules as reading the corresponding post or draft.

**6. Publish the original on the owner's blog**

Each person or organization must have a public Ghost blog on a configured domain or subdomain. Published pages must show the correct publisher, author and language, with stable URLs, search metadata, a sitemap and links between published translations. Draft translations must remain private.

The platform must verify that the approved original is live before distributing copies elsewhere. Setup may be handled by an operator; self-service domain setup is optional.

**7. Distribute to supported external platforms**

Users must be able to choose destinations and see whether each supports automatic publishing or needs a manual step. External account connections are managed through NyxID and assigned to the selected person or organization. An organization post must use its configured connection, even where the destination requires a named person's account. A failed connection must not silently switch to another account or authorization route.

For automatic organization writes to external platforms, NyxID currently also requires an Organization Admin to authorize the exact content, destination and action. This connection requirement applies to new posts and corrections and must be visible in both CMS and service results. It does not add a separate editorial role or apply to publishing the original Ghost post.

| Platform | Required support and limits |
| --- | --- |
| DEV / dev.to | Automatic personal and organization publishing where the connected account has permission. Editing an existing copy depends on the original author's account rights. |
| Hashnode | Automatic organization publishing with an eligible Pro publication and account permissions. Personal Hashnode support is optional. |
| Medium | Prepare content and the original URL for assisted import or submission, and track the result. General automatic publishing is not assumed. |
| HackerNoon | Prepare an assisted submission and track editorial review. Company-domain originals normally require a company account, even with an individual byline. Acceptance is controlled by HackerNoon. |

English is the initial external-distribution language. Chinese distribution is enabled only where the destination's policies and rendering have been verified. Users can select full copies or excerpts with source links where permitted, and choose a delay after original publication. Without scheduling, the delay requires a later human action.

Owners must confirm their right to publish the text and images. Each connection must respect the destination's account, content and automation rules; missing permissions or subscriptions must produce a clear explanation.

**8. Track publication, corrections and removal**

Show the status and live URL for each destination in the CMS and through the NyxID service, distinguishing approval needed, manual action needed, submitted, published, failed and uncertain outcomes. A submission must not be reported as a published article. One failed destination must not erase successful results elsewhere.

Users must be able to cancel pending work, issue approved corrections and request removal of known copies. Interrupted or uncertain publishing must be checked before retrying to avoid duplicates. Track manual follow-up when a platform cannot update or remove a copy, including when an author's account is no longer available.

Provide publication history and source-link verification. Distribution aims to improve reach and attributed traffic; search rankings and backlink value are not guaranteed.

**9. Show readership and distribution metrics in the platform**

Provide a dashboard inside each personal or organization workspace, with an overview and article-level results. Make the same metrics queryable through the NyxID service. Both access routes must support filters by date, article, language and destination.

For the owner's Ghost blog, collect page views, estimated unique visitors, top articles and referral sources, and show how readership changes over time. Track visits arriving from external platforms using referral or campaign information where available; identify unattributed traffic honestly. This tracking must work with self-hosted Ghost without requiring Ghost(Pro).

Show distribution results such as published copies, pending submissions and failed deliveries. Display external article views, reactions and comments only where a supported, authorized source supplies them. Unavailable metrics must say “Unavailable,” not zero. Show the source and last update time; do not combine audiences across platforms into a claimed unique-reader total.

Personal metrics are visible to their owner; organization members can view their organization's aggregate dashboard. Keep other owners' data private, exclude private drafts and previews from readership metrics, and follow configured privacy and consent requirements. Tracking failures must not block publication.

**10. Keep content private and the service recoverable**

Private drafts, previews, images and account connections must be accessible only to authorized people. Unrelated users and organizations must not access one another's work. Platform operators remain privileged administrators; disclose their access and keep an access history. Account secrets must stay out of users' content, exports and browser responses.

Keep a history of important editing, approval and publishing actions. Backups must cover content, publication records and site configuration, with demonstrated restoration. Publishing-service interruptions must not take down already published Ghost pages; site outages need documented recovery behavior.

Validate the caller and their permissions for every CMS and NyxID service action, including Markdown downloads and metrics queries. Delegated clients and agents may act only within the user's authorized scope. Service access must not turn an ordinary member into an organization publisher or expose another owner's private content.

**Optional additions**

Scheduled publishing, self-service workspace and site provisioning, automatic custom-domain setup, personal Hashnode publishing and additional languages or destinations are optional. Scheduling must recheck permissions when a job runs; organization distribution through NyxID still needs its Admin authorization. Both personal and organization ownership are required regardless of which extras are selected. Initial workspace setup may be operator-assisted.

**Implementation reference**

The earlier technical requirements and acceptance checks are retained in the project repository. NyxID sign-in remains the authentication approach. The current scope supersedes the older editorial-role model, drafts-only service access, CMS-only confirmation and optional metrics scope. Organization Admins and designated publishers can publish to organization channels; personal owners can publish their own content through either access route. Other applicable security and recovery checks remain. Opus 5.5 reviewed v0.3; the later scope changes still need implementation validation.
