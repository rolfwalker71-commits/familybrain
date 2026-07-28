export type LatLng = [number, number];

export type OjpStop = {
  name: string;
  stopRef?: string;
  lat?: number;
  lon?: number;
  arrival?: string;
  departure?: string;
};

export type OjpLeg = {
  mode: string;
  trainNumber?: string;
  lineName?: string;
  board: OjpStop;
  alight: OjpStop;
  intermediateStops: OjpStop[];
  path: LatLng[];
};

export type OjpTrip = {
  id: string;
  startTime?: string;
  endTime?: string;
  durationSeconds?: number;
  legs: OjpLeg[];
  path: LatLng[];
};

export type OjpTripRequestInput = {
  origin: {
    lat?: number;
    lon?: number;
    name?: string;
  };
  destination: {
    lat?: number;
    lon?: number;
    name?: string;
  };
  depArrTimeIso: string;
  numberOfResults?: number;
};
