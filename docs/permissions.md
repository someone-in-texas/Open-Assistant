# Firefox permissions

| Permission                 | Reason                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `activeTab`                | User-invoked access to the foreground page                     |
| `contextMenus`             | Selection and editable-field actions                           |
| `storage`                  | Preferences, local messages, ephemeral session handoff         |
| `tabs`                     | User-reviewed tab picker, title/domain, lifecycle invalidation |
| `scripting`                | On-demand isolated content/bridge injection after permission   |
| `identity`                 | Hosted/self-hosted OIDC authorization-code flow with PKCE      |
| Optional `clipboardWrite`  | Copy fallback after a user gesture                             |
| Optional `nativeMessaging` | BYOK companion chosen by the user                              |
| Optional `notifications`   | User-enabled completion/error notices                          |

HTTP/HTTPS/file host patterns are optional, never install-time required. The extension explains and requests exact origins, rechecks before use, provides fallback when denied, and removes cached source context when revoked. ChatGPT access is requested only for `https://chatgpt.com/*` during handoff. Privileged, AMO, unsupported schemes, and file URLs fail closed.
