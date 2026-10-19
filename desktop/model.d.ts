export interface DesktopRecord {
  id: string;
  [key: string]: any;
}
export interface DesktopData {
  version: number;
  appearanceVersion: number;
  categories?: string[];
  platforms: DesktopRecord[];
  clients: DesktopRecord[];
  archivedClients: DesktopRecord[];
  orders: DesktopRecord[];
  templates: DesktopRecord[];
  assets: DesktopRecord[];
  toolTemplates: DesktopRecord[];
  current: string;
  profile: { name: string; artist: string; tagline: string };
  watermarkMark?: string;
}
export function initialData(): DesktopData;
export function validateBackup(raw: unknown): DesktopData;
export function mergeBackup(current: unknown, incoming: unknown): DesktopData;
export function categoryChoices(data: DesktopData): string[];
