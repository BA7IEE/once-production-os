// Historical review journeys remain explicitly available alongside direct self confirmation.
export function legacyPortal(raw){const url=new URL(raw);url.searchParams.set('legacy','1');return url.toString();}
