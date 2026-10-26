/** Real photos placed in the prototype, metadata stripped. Alex's own photos have no credit.
 * North Island spot banners are from Wikimedia Commons (credit set); they are resized, and shown
 * cropped to a 3:1 banner. CC BY-SA ones stay under their CC BY-SA licence. All credits: /credits.
 * Spots with no entry keep the grey PhotoSlot placeholder. */
export type PhotoCredit = { author: string; licence: string; licenceUrl: string; sourceUrl: string };
export type Photo = { src: string; width: number; height: number; place: string; alt: string; position?: string; credit?: PhotoCredit };

export const HOME_HERO: Photo = { src: "/photos/home-hero-p22.jpg", width: 2400, height: 1600, place: "South Pegasus, Stewart Island", alt: "Calm bay at low tide with a dinghy on the sand and bush headlands behind" };
export const ABOUT_MAIN: Photo = { src: "/photos/about-p15.jpg", width: 2048, height: 1365, place: "D'Urville Island Wilderness Lodge", alt: "Gravel beach with a jetty, a dinghy and a kayak under evening cloud" };
export const ABOUT_INSET: Photo = { src: "/photos/about-inset-p06.jpg", width: 900, height: 1200, place: "Stephens Passage, D'Urville Island", alt: "Fisher on a boat bent into a hooked fish, a rocky island behind" };

export const SPOT_BANNERS: Record<string, Photo> = {
  bay_of_islands: { src: "/photos/spot-bay_of_islands-commons.jpg", width: 2400, height: 1350, place: "Paihia Wharf, Bay of Islands", alt: "Paihia Wharf and its ferry building, with jet boats tied up alongside", position: "50% 55%",
    credit: { author: "Bahnfrend", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Paihia_Wharf,_2013_(01).jpg" } },
  far_north: { src: "/photos/spot-far_north-commons.jpg", width: 2400, height: 1607, place: "Pukenui Wharf, Houhora Harbour", alt: "Green and red fishing boat at Pukenui wharf, small boats moored in the harbour behind", position: "50% 62%",
    credit: { author: "Flickr user PhillipC / Phillip Capper", licence: "CC BY 2.0", licenceUrl: "https://creativecommons.org/licenses/by/2.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Pukenui_wharf.jpg" } },
  coromandel: { src: "/photos/spot-coromandel-commons.jpg", width: 2400, height: 1600, place: "Whitianga Pier, Mercury Bay", alt: "Whitianga pier and moored boats across the harbour, palms and Norfolk pines behind", position: "50% 48%",
    credit: { author: "Ulrich Lange, Bochum, Germany", licence: "CC BY 3.0", licenceUrl: "https://creativecommons.org/licenses/by/3.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Whitianga_Harbour,_Whitianga_Pier.jpg" } },
  hauraki_gulf: { src: "/photos/spot-hauraki_gulf-commons.jpg", width: 2121, height: 1184, place: "Takapuna Beach boat ramp, Auckland", alt: "Car backing a trailer boat down the Takapuna boat ramp, with the beach and apartment towers behind", position: "50% 72%",
    credit: { author: "Sids1 from New Zealand", licence: "CC BY 2.0", licenceUrl: "https://creativecommons.org/licenses/by/2.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Boat_Ramp_At_Takapuna_Beach_(13259807223).jpg" } },
  bay_of_plenty: { src: "/photos/spot-bay_of_plenty-commons.jpg", width: 2400, height: 1800, place: "Pilot Bay, Mount Maunganui", alt: "Dinghies on the grass at Pilot Bay, yachts moored in calm water and Mauao behind", position: "50% 55%",
    credit: { author: "Ed Kruger", licence: "CC BY-SA 3.0 NZ", licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/nz/deed.en", sourceUrl: "https://commons.wikimedia.org/wiki/File:Abaconda-mount.jpg" } },
  east_cape: { src: "/photos/spot-east_cape-commons.jpg", width: 2048, height: 1536, place: "Tolaga Bay Wharf", alt: "The long concrete deck of Tolaga Bay Wharf running out to sea, a rocky islet on the horizon", position: "50% 52%",
    credit: { author: "Ulrich Lange, Dunedin, New Zealand", licence: "CC BY-SA 3.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Tolaga_Bay_Wharf.jpg" } },
  hawkes_bay: { src: "/photos/spot-hawkes_bay-commons.jpg", width: 2400, height: 1602, place: "Iron Pot, Ahuriri, Napier", alt: "Fishing boats moored in the Iron Pot at Ahuriri, a rock wall and old building behind", position: "50% 65%",
    credit: { author: "DB Thats-Me", licence: "CC BY-SA 3.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fishing_boats_at_Napier_-_panoramio.jpg" } },
  taranaki: { src: "/photos/spot-taranaki-commons.jpg", width: 2400, height: 1607, place: "Paritutu and the Sugar Loaf Islands, New Plymouth", alt: "Paritutu rock rising over the sea, with the Sugar Loaf Islands offshore", position: "50% 45%",
    credit: { author: "Colby Blaisdell", licence: "CC BY 2.0", licenceUrl: "https://creativecommons.org/licenses/by/2.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Paritutu.jpg" } },
  wellington: { src: "/photos/spot-wellington-commons.jpg", width: 2400, height: 1800, place: "Seatoun Wharf, Wellington", alt: "Seatoun beach with a bench on the path and Seatoun Wharf reaching into the harbour", position: "50% 52%",
    credit: { author: "Wainuiomartian", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Seatoun_Wharf,_Wellington_01.jpg" } },
  marlborough_sounds: { src: "/photos/spot-marlborough_sounds-p11.jpg", width: 2400, height: 1600, place: "Punga Cove, Marlborough Sounds", alt: "Pontoon with a trailer boat tied up and yachts moored in a bush-ringed bay", position: "50% 62%" },
  moeraki: { src: "/photos/spot-moeraki-p02.jpg", width: 2400, height: 1800, place: "Moeraki wharf at sunrise", alt: "Moored boats and the wharf in Moeraki harbour at dawn", position: "50% 60%" },
  fiordland: { src: "/photos/spot-fiordland-p20.jpg", width: 2400, height: 1800, place: "Deas Cove, Doubtful Sound", alt: "Shingle shore under overhanging trees with a blue alloy boat and mountains behind", position: "50% 55%" },
  haast_jackson: { src: "/photos/spot-haast_jackson-p03.jpg", width: 2400, height: 1109, place: "Cascade Point, near Jackson Bay", alt: "Flat water toward distant mountains, seen from the bow of a boat", position: "50% 50%" },
  stewart_island: { src: "/photos/spot-stewart_island-p19.jpg", width: 2400, height: 1350, place: "Port Pegasus, Stewart Island", alt: "Snorkeller in a calm, overcast inlet with a rocky, bush-covered shore", position: "50% 50%" },
  bluff: { src: "/photos/spot-bluff-p21.jpg", width: 2400, height: 1800, place: "Foveaux Strait", alt: "Low sun over choppy water with a rod in front and a seabird on the water", position: "50% 55%" },
};
