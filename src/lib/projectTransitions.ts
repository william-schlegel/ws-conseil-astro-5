/** Noms `transition:name` partagés entre la carte projet et la page détail (ClientRouter / View Transitions). */
export function projectTitleTransitionName(slug: string): string {
  return `projet-${slug}-title`;
}

export function projectBriefTransitionName(slug: string): string {
  return `projet-${slug}-brief`;
}
