export const EVENT_VENUE = "Institute of Information Technology (IIT), University of Dhaka";
export const EVENT_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Institute%20of%20Information%20Technology%20%28IIT%29%2C%20University%20of%20Dhaka%2C%20Dhaka%2C%20Bangladesh";

export function qualifiedVenue(venue: string) {
  if (/\bIIT\b|Institute of Information Technology/i.test(venue) && !/University of Dhaka/i.test(venue))
    return `${venue}, University of Dhaka`;
  return venue;
}
