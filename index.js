/**
 * Host half of the dsh-codex-reasoning-bar bundle. The control is pure browser
 * UI that rides the Client `modelDirectories` service, so the Host side has
 * nothing to contribute; the empty `apply` exists so the row in
 * `cordis.patch.yml` activates and the `dsh.client` half is discovered through
 * the manifest.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply() {}
