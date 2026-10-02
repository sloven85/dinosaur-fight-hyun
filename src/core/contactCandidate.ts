/** Explicit opt-in release candidate; normal game URLs retain shipped behavior. */
export function contactCandidate(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('contactCandidate');
}
