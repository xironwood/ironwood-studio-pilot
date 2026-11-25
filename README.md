# Ironwood Studio pilot website

This website uses fictional fees to test publishing from Ironwood Studio. An approved intake edit changes `intakeFee` in `fees.json`. The individual fee is fixed during this pilot. The example Good Faith Estimate includes one intake and eleven individual visits.

## Build and check

Use Node.js 22 or newer. Run `node pilot.test.mjs`, then `node build.mjs` from a committed checkout. The build writes the fee page, estimate, and source commit to `dist/`. Cloudflare Pages supplies `CF_PAGES_COMMIT_SHA` during hosted builds.

## Release

The approved target is the Git-connected Pages project `ironwood-studio-pilot` in the `agency` account, using `xironwood/ironwood-studio-pilot`, production branch `main`, build command `node build.mjs`, and output directory `dist`. The default Pages hostname serves the test. Disable automatic branch previews. The Ironwood portal and Paper Moon have their own release processes.

Review the initial site and enable Pages production builds from `main`. Verify that baseline before exercising a fee edit.

For Studio fee changes, configure the portal signer's Ed25519 public key as the repository Actions variable `STUDIO_PUBLIC_KEY`. The matching private key belongs in the portal's protected secret store. Allow the workflow to create pull requests. Protect `main` with a pull-request review requirement and the up-to-date `verify-approval` status from GitHub Actions.

The `studio-fee.yml` workflow accepts an approval ID, base64url payload and Ed25519 signature. The signed JSON fields are `scope` (`xironwood/ironwood-studio-pilot:main:intakeFee`), `id`, `base` (full deployed commit), `previous`, `next`, `approved` and `expires` (epoch milliseconds, 24 hours apart). A verified candidate changes only the one fee on its exact starting commit.

The portal integration still needs its authenticated stamp action. It must check the member's practice, sign these test-site values on the server, and keep the link to the approving member in the portal. The site and its GitHub history contain fictional fee data only.

Review the pull request and its status, then merge. Cloudflare Pages builds the merge commit. Verify the successful production deployment's commit in Cloudflare and run `node verify-live.mjs FULL_COMMIT` to check the fee and estimate on the public site.
