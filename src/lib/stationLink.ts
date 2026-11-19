export function stationLinkUrl(origin: string, code: string): string {
  return `${origin}/#/operator?phone=${code}`;
}
