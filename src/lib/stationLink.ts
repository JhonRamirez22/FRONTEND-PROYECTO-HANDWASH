/** Where an ADMIN link lands: the operator console (Mac, phone) or the professor's live panel. */
export type StationLinkTarget = 'operator' | 'panel';

export function stationLinkUrl(origin: string, code: string, target: StationLinkTarget = 'operator'): string {
  return `${origin}/#/${target}?phone=${code}`;
}
