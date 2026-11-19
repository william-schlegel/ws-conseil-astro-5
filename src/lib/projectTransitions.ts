/** Noms `view-transition-name` partagés entre la carte projet et la page détail (ClientRouter / View Transitions). */
export function projectTitleTransitionName(slug: string): string {
  return `projet-${slug}-title`;
}

export function projectBriefTransitionName(slug: string): string {
  return `projet-${slug}-brief`;
}

export function projectImageTransitionName(slug: string): string {
  return `projet-${slug}-image`;
}
