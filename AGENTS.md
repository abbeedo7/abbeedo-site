# abbeedo publishing instructions

## User-approved workflow

The user explicitly wants requested website and shared web-application changes tested and published to the existing domain in the same task. This preference was confirmed on 20 November 2026. Do not stop after editing or delivering a ZIP when deployment access is available. Read-only questions and reviews do not request a deployment.

Use the connected Vercel tools to publish directly when GitHub is unavailable. A GitHub connection is useful for source history, releases and Git-triggered deployment, but it is not a prerequisite for publishing the website through Vercel.

Verify the account, project, environment and source before each deployment:

- Team: `abbeedo`, `team_TU8mJMxFCZyhEH4lRCxRbsCO`.
- Existing project: `abbeedo-tv-1.1`, `prj_I9IDGoMjiVx0KjnmziqK2Pwf5GZa`.
- Production origin: `https://www.abbeedo.com`; preserve the redirect from `abbeedo.com`.
- Website name: `ابوناصر` / `abbeedo`; application name: `ابوناصر TV` / `abbeedo TV`.
- Node.js 22; install `npm ci`; build `npm run build`; Build Output API is generated in `.vercel/output`.

Run checks appropriate to the actual change and validate the deployed revision and `/api/health`. Publish only a build that passes the applicable checks. Report actual deployment status and any remaining external dependency. Never describe a local build or a READY preview as a completed production deployment.

## Preserve resources and data

Keep the existing project, domains, environment variables and private Blob store. Do not recreate the project or rotate storage and encryption secrets as a routine update. Never print credentials or include them in source, screenshots or public artifacts.

The private store connected on 20 November 2026 is `store_uGINUZkjj7yssiTs`, named `abbeedo-tv-private`. Its connection supplies `BLOB_READ_WRITE_TOKEN`. The application stores durable bootstrap keys privately; preserve these records and existing user data.

Use the existing Hobby plan. Do not purchase services, upgrade plans, or modify unrelated projects as part of ordinary updates.

## GitHub and native releases

The intended public source and release repository is `abbeedo7/abbeedo-site`. Verify access before reading its state or claiming a push succeeded. Do not substitute the unrelated `henps3` repository. Never force-push or replace existing unreviewed history. GitHub visibility or access problems do not justify leaving an otherwise deployable website update unpublished.

Native APK and EXE release files must come from the user's GitHub Releases and official asset delivery hosts. Keep Windows EXEs out of Git history; the existing release workflow builds them and publishes Releases. Preserve the original Android signing identity and exclude private signing keys from public source.

Website changes alone do not create a new Android, Windows or packaged Samsung binary. Increment and build the relevant native version when its native code changes. Samsung installation and store submission require the owner's signing certificates; do not invent a production certificate or claim physical device testing that did not occur.

Do not modify the previous projects under `/workspace/sites/abunasser-apple-web` or the original Android 3.9.3 project when working on this delivery.
