import type { NormalizedHotspot } from './targetGeometry';

export type DoctrineSection = {
  id: string;
  title: string;
  subtitle?: string;
  children?: string[];
  content?: string;
  color?: string;
  hotspot: NormalizedHotspot;
};

type DoctrineSectionsPayload = {
  sections: DoctrineSection[];
};

export async function loadDoctrineSections(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load hotspot data: ${response.status}`);
  }

  const payload = (await response.json()) as DoctrineSectionsPayload;
  return Array.isArray(payload.sections) ? payload.sections : [];
}
