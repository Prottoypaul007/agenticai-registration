# Registration capacity verification

Tested on October 14, 2026 using an isolated real PostgreSQL database with every repository migration applied and capacity set to 40.

| Scenario | Existing counted registrations | Concurrent requests | Accepted | Rejected as full | Final count |
| --- | ---: | ---: | ---: | ---: | ---: |
| Empty database | 0 | 60 | 40 | 20 | 40 |
| Last place: 25 Batch 14 + 14 website | 39 | 50 | 1 | 49 | 40 |
| Already full: 25 Batch 14 + 15 website | 40 | 50 | 0 | 50 | 40 |
| Batch 14 fills all places | 40 | 50 | 0 | 50 | 40 |
| Five rejected website entries excluded from count | 39 | 50 | 1 | 49 | 40 |
| Existing Batch 14 count already above limit | 41 | 50 | 0 | 50 | 41 |

All 310 concurrent requests passed. An additional request after each scenario was also rejected as full. The tests verified that all requests were simultaneously waiting on the transaction advisory lock before releasing them. No live registrations or settings were changed.

TypeScript checks and the full regression suite also passed: 72 tests in 20 files. The API regression test checks that a stale form receives HTTP 403 with `registration_full` when the database rejects it at capacity.

Repeat with `npm run test:concurrency`. These results verify the repository migrations in the local test database; live enforcement assumes the same migrations are installed and the admin saves capacity as 40. The limit blocks additional website submissions; it does not delete existing registrations above the limit or cap Batch 14 imports.
