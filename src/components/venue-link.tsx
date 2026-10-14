import { MapPin, ArrowUpRight } from "lucide-react";
import { EVENT_MAPS_URL, EVENT_VENUE, qualifiedVenue } from "@/lib/venue";

export function VenueLink({ venue = EVENT_VENUE }: { venue?: string }) {
  return <a href={EVENT_MAPS_URL} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-2 text-sm text-slate-300 transition hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400">
    <MapPin size={17} className="mt-0.5 shrink-0 text-cyan-400"/>
    <span>{qualifiedVenue(venue)}<span className="mt-1 flex items-center gap-1 text-xs text-cyan-300 underline underline-offset-4">View on Google Maps <ArrowUpRight size={13}/></span></span>
  </a>;
}
