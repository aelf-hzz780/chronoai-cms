**Blogging platform — expected deliverables**

Version 0.7 · 28 October 2026 · CMS and NyxID service access for personal and organization publishing

The implementation must deliver the following nine outputs against the [requirements](#file-requirements-md). These are expected software and handover outputs; they have not been built by the requirements study.

**1. A standalone platform with self-hosted Ghost and NyxID sign-in**

Deliver an installation on operator-controlled infrastructure, with its own URL, NyxID OAuth/OpenID Connect sign-in and an entry point from NyxID. Use ORNN/Aevatar/CMA as integration references where applicable. Include the application registration and sign-in configuration, domains, operator access, persistent storage and reproducible setup instructions, with costs and responsibilities.

**Complete when:** opening the app directly or from NyxID leads through NyxID sign-in to the same account and workspaces. Users can draft, publish and view metrics according to their permissions, and sign-out ends access to the protected interface. The deployment runs without Ghost(Pro). The current design uses separate Ghost installations per publication and language; one bilingual publication requires two. Capacity and cost must reflect that.

**2. A registered NyxID service with usable content operations**

Deliver the service registration, documented API operations and NyxID configuration for reading posts, managing drafts, publishing, retrieving original Markdown files and querying metrics. Preserve the caller's identity and enforce the same permissions as the CMS.

**Complete when:** a user can perform each action through NyxID without returning to the CMS. Retrieved Markdown matches the stored source, metrics match the CMS, and the same post/status appears through both routes. Unauthorized personal, organization and channel access is rejected. Sign-in alone or a link to the CMS does not satisfy this deliverable.

**3. Personal and organization workspaces with permissions**

Deliver separate personal and organization ownership, an explicit “Publish as” selection, and Admin-managed publishing roles. Every member can manage their own personal posts and create organization drafts. Organization Admins and designated publishers can publish to organization channels.

**Complete when:** through both CMS and NyxID, an ordinary member can publish personally and manage their organization drafts but cannot publish to organization channels. Org Admins and designated publishers can publish organization content. Losing the relevant authority blocks pending org releases, while personal ownership and access remain separate.

**4. An English and Chinese Markdown editor**

Deliver article editing, private previews, revisions, linked translations, image handling and Markdown import/export. Include Markdown upload, draft editing and original `.md` retrieval through the NyxID service.

**Complete when:** English and Chinese articles retain their original Markdown, render correctly, and can be reviewed and published separately. Conflicting edits are reported, and private drafts remain private.

**5. Draft submission and publication on the owner's blog**

Deliver draft submission, publisher confirmation and the connection to Ghost, including correct ownership, bylines, language links and public metadata. Preserve an archive of confirmed versions.

**Complete when:** personal owners can self-publish and org Admins/designated publishers can release organization drafts through either CMS or NyxID, without a mandatory review chain; later edits do not silently change live content; and the live original is verified before external distribution.

**6. External distribution connections and assisted submissions**

Deliver automatic DEV personal/org publishing and Hashnode organization publishing with NyxID-managed connections and protected account setup. Deliver assisted Medium import/submission and HackerNoon submission, with content, images, attribution and source links prepared for the user.

**Complete when:** each workflow is demonstrated with suitable accounts; only org Admins or designated publishers can distribute organization content; and NyxID-managed organization writes obtain its required Admin authorization. Automatic connections must pass live validation, with permissions, paid-plan needs and manual steps visible. Assisted submission must not be presented as automatic publication or guaranteed acceptance.

**7. A publication and distribution dashboard**

Deliver per-destination status, live links, pending actions, history, corrections, cancellation and removal requests. Include account-reconnection guidance and source-link checks. The NyxID service must expose the same status and authorized lifecycle actions.

**Complete when:** users can distinguish submitted from published, understand partial failures and uncertain outcomes, and manage existing copies without duplicate posts. Unsupported removal or lost editing access stays visible as follow-up work.

**8. A metrics dashboard inside the platform**

Deliver readership tracking for the owned Ghost blogs and a dashboard showing views, estimated visitors, popular articles, referral sources, trends and distribution results. Include filters by date, article, language and destination. Expose the same queries and filters through the NyxID service. Add external engagement figures only where supported data access is available.

**Complete when:** visits to published test articles appear under the correct owner, article and language; filters and trends work; private previews are excluded; and each source shows its update time. Unsupported external metrics show “Unavailable.” CMS and NyxID queries agree, neither route exposes another owner's private metrics, and tracking outages do not prevent publishing.

**9. An operations handover with acceptance evidence**

Deliver deployment and maintenance documentation, monitoring, backup and restoration procedures, account/offboarding guidance, and evidence that the agreed requirements work. Record supported versions, account/plan prerequisites, costs, known limitations and any checks still outstanding.

**Complete when:** testing demonstrates owner isolation, publishing-permission enforcement, secure NyxID sign-in and authenticated service calls, consistent CMS/service permissions, secret protection, correct bilingual publication, metrics access control, safe recovery from interrupted publishing and a successful restore. Operators can maintain the service using the supplied materials.

**Optional deliverables**

Add scheduled publishing, self-service workspace/site provisioning, automated custom domains, personal Hashnode support or additional destinations only if selected. Each must meet the same ownership, permission, confirmation and recovery requirements. Scheduling must also demonstrate cancellation and permission changes before execution. Initial workspace provisioning may be operator-assisted.

**Acceptance basis**

All nine outputs are required. A written description alone does not count as a working deliverable. Unverified or blocked behavior must be reported clearly; replacing an automatic connector with a manual workflow requires an explicit scope decision.

The technical deliverable reference retained in the project repository contains earlier validation checks and engineering dependencies. Its detailed editorial-role model, drafts-only integration access, CMS-only confirmation and optional metrics scope are superseded here. The nine outputs above are the current delivery scope. Separate local login, duplicate direct-provider connections and NyxID-outage continuity are not required deliverables.
