# Publication preference

The user instructed on 2026-10-28: after a successful production build and relevant validation, update the existing test Site automatically. This authorization persists for subsequent work unless the user overrides it.

- Existing Site project_id: appgprj_6ae15b6ab0788191b0e1182033b1b9a6
- Existing URL: https://ai-2d-asset-studio-flame-knight.songkiem9.chatgpt.site
- Preserve the Site identity, URL and current audience.
- Use the Sites skill and native publishing tools. Keep the full editable project source and verify the deployment result before reporting success.
- The publishing checkout is /workspace/sites/ai-2d-asset-studio-test. Preserve .git and .openai/hosting.json when synchronizing source. Never copy node_modules, runtime data, secrets or local test scratch files into source archives.
- Publishing includes the source commit/push required by Sites in that publishing checkout. It does not grant new authorization to commit or push the separate GitHub repository.
