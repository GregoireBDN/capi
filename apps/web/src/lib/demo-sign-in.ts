/**
 * The demo sign-in of the pull request previews (#608): on a preview that
 * offers it, the sign-in page signs in the demo account by itself, except
 * right after « Se déconnecter » in the same tab, so signing out still shows
 * the form (and a button to come back in).
 */
const SIGNED_OUT_KEY = 'capi:demo-signed-out'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Called on sign-out: the next sign-in page of this tab waits for a tap. */
export function rememberSignedOut() {
  try {
    storage()?.setItem(SIGNED_OUT_KEY, '1')
  } catch {
    // Storage refused (private window): the demo sign-in stays automatic.
  }
}

/** Whether the sign-in page may sign the demo account in by itself. */
export function demoSignInIsAutomatic(): boolean {
  try {
    return storage()?.getItem(SIGNED_OUT_KEY) !== '1'
  } catch {
    return true
  }
}

/** A tap on the demo button: automatic again for this tab. */
export function forgetSignedOut() {
  try {
    storage()?.removeItem(SIGNED_OUT_KEY)
  } catch {
    // Nothing to forget.
  }
}
