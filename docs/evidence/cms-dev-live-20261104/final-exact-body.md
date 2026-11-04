# Verifying a NyxID-managed publishing workflow

This article is a local integration test of an English publishing workflow. It connects a content management system, a self-hosted Ghost original, and a publishing account managed through NyxID.

## Identity and ownership

The author signs in through a real local NyxID service. The CMS keeps personal ownership separate from organization publishing roles. The destination must use the explicitly selected connection and account, with no silent account fallback.

## Confirmed content

Publishing starts from a specific saved revision. The title, Markdown, credited author, owner, language, destination, and content rights are confirmed before the corresponding action. Later draft edits must not silently replace the confirmed version.

## Original and receipt

The original is hosted on a local Ghost installation. Its visible page and saved revision are checked before any external copy is requested. A destination result must retain its remote article identifier and URL, and a readback must match the confirmed content and source link.

This local original is accessible on the test machine. Its localhost address is not evidence of public Internet reachability.

## Safe execution

The integration run handles one explicitly selected task at a time. NyxID execution approvals remain applicable. If an operation times out or its result cannot be proved, it must be reconciled before another write is considered.

This test does not claim production readiness, organization-wide acceptance, or completion of all external publishing requirements. It contains no credentials, private keys, or user secrets.


Author: BlogSystem Local Operator

Original: [http://localhost:3468/chrono-5c71a85d-1e45-40ae-85c5-4ecd2dd14824/](http://localhost:3468/chrono-5c71a85d-1e45-40ae-85c5-4ecd2dd14824/)

<!-- chrono-delivery:7c2bb69b-b2f5-4f25-bcb4-32569d48613c -->