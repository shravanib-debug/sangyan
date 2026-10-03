# Security policy

Do not open a public issue containing credentials, access tokens, broker payloads, journal text, or real financial data. Report a suspected vulnerability privately to the repository owner.

## Non-negotiable boundaries

- Thehrav does not place, modify, or cancel orders.
- Broker authentication uses the broker-hosted flow; users never paste broker credentials or tokens into Thehrav.
- Broker secrets, token-encryption keys, Supabase service-role keys, and VAPID private keys remain server-side.
- Raw CSV and audio remain on-device by default.
- Replayed events are always labelled simulated.

If a broker secret or token is exposed, disconnect affected sessions, rotate the relevant application secret or encryption key, preserve only redacted incident metadata, and block deployment until review is complete.
