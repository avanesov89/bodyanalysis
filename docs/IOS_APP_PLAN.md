# iOS app plan

## Product shape

The iOS app is a full client for "Тело в цифрах", not a separate sync utility.
It uses the same Firebase project as the web app and reads/writes the same user data.

```text
Web app      -> Firebase Auth + Firestore
iOS app      -> Firebase Auth + Firestore
Apple Health -> iOS app -> Firestore -> Web app
```

## First MVP

The first iOS milestone should prove the core loop:

1. Sign in with the same Firebase Email/Password account used by the web app.
2. Request Apple Health permissions.
3. Read recent Apple Health data.
4. Save normalized entries to `healthUsers/{uid}/entries`.
5. Show those entries in the existing web app without manual import.

Start with the most reliable HealthKit data types:

- activity: steps, active calories;
- body: weight;
- sleep: sleep duration, after activity/body sync is stable.

Nutrition should come later because it depends on whether FatSecret writes usable nutrient totals to Apple Health.

## Shared Firestore paths

```text
healthUsers/{uid}/entries/{entryId}
healthUsers/{uid}/profile/settings
```

`uid` comes from Firebase Authentication. The iOS app and web app must use the same Firebase Auth user.

## Entry sync metadata

Every entry can carry optional source metadata:

```ts
source?: "manual" | "apple_health" | "fatsecret" | "mi_fitness" | "health_connect"
sourceName?: string
externalId?: string
syncedAt?: string
```

Manual web entries default to `source: "manual"`.

Imported iOS entries should set:

- `source: "apple_health"`;
- `sourceName` to the originating HealthKit source name when useful, for example `Apple Watch` or `Mi Fitness`;
- `externalId` to a stable HealthKit-derived identifier where possible;
- `syncedAt` to the ISO timestamp of the sync operation.

## Deduplication rule

The iOS app should not create a new Firestore document every time it sees the same HealthKit sample.
For imported HealthKit entries, prefer a deterministic Firestore document id derived from:

```text
source + HealthKit sample uuid
```

For daily aggregates, derive the id from:

```text
source + kind + date + metric group
```

Examples:

```text
apple_health:activity:2026-08-20
apple_health:body_weight:{healthkit-sample-uuid}
apple_health:sleep:2026-08-20
```

## iOS screens

MVP screens:

- sign in;
- today;
- history;
- sync settings;
- sync status.

The sync settings screen should show permission status and last successful sync time.

## HealthKit permissions

Ask for read access only at first.
Possible first types:

- step count;
- active energy burned;
- body mass;
- sleep analysis.

Do not request sensitive or unused categories until the product actually needs them.

## Testing order

1. Local Xcode install on the user's iPhone.
2. Verify Firebase sign-in.
3. Verify Apple Health permission prompts.
4. Sync last 7 days of activity and weight.
5. Confirm web app shows synced entries.
6. Expand to 30 or 90 days.
7. Move to TestFlight after the loop is stable.
