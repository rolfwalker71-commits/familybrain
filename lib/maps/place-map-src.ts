/** Client + server safe URL for Buddy static place map snippets. */
export function placeMapImageSrc(
  lat: number,
  lon: number,
  zoom = 15
): string {
  return `/api/dashboard/place-map?lat=${lat}&lon=${lon}&z=${zoom}&v=gmaps3`;
}
