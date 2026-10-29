# Google HTTP 400 diagnostics

The reported test and model-refresh failures both occur at model-list discovery, before character image analysis. Existing production logs record HTTP 400 but intentionally omit raw provider exceptions. Their previous generic mapping cannot establish whether the cause is a key, restrictions, region or request configuration. Private Site access does not block backend outbound Google requests.

The update distinguishes unsupported backend region, expired/revoked/leaked key, HTTP-referrer/IP restrictions, disabled API, invalid key and other request errors. Unknown HTTP 400 responses expose only bounded credential-redacted Google text; key-aware redaction removes the exact key, its URL-encoded form, Gemini-key patterns and URLs. Without a credential-redaction context, arbitrary upstream text is not returned. Phase labels distinguish `models.list` from the image/JSON probe. Server diagnostics log only stage/category/status, never raw keys/messages.

Tests include the actual official JS SDK with intercepted HTTP transport, exercising Google-shaped HTTP 400 responses without a real key or provider charges. No model is silently substituted. Google documents `pageSize=200` as valid (maximum 1000): https://ai.google.dev/api/models . Changing pagination or making the Site public is not an evidence-backed fix.

After deployment, enter the key again if the temporary Worker session expires, then use model refresh once. The updated message or safe server category identifies the next corrective action. Existing generic logs cannot retroactively recover Google's discarded error body; this update does not claim the user's real key has already connected successfully.
