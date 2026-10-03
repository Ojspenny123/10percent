export type HubRank = "major" | "secondary" | "local";

export type CityInfo = {
  id: string;
  city: string;
  country: string;
  hub: HubRank;
  rent: number;
  tentpole: "Common" | "Occasional" | "Rare";
  region: string;
  studio: string;
  pros: string;
  cons: string;
  awards: string;
};

export const CITIES: CityInfo[] = [
  { id: "los-angeles", city: "Los Angeles", country: "United States", hub: "major", rent: 12000, tentpole: "Common", region: "US", studio: "Pacific Pictures", pros: "Hollywood volume. Studio films and series are the default.", cons: "Rent and salaries are among the highest in the game.", awards: "A small edge on Oscar, SAG, and Emmy campaigns, and on US talk shows." },
  { id: "new-york", city: "New York", country: "United States", hub: "major", rent: 15000, tentpole: "Common", region: "US", studio: "Hudson Pictures", pros: "Theatre-adjacent talent and a full studio pipeline.", cons: "The most expensive office in the game.", awards: "US awards campaigns and US talk shows travel well from here." },
  { id: "atlanta", city: "Atlanta", country: "United States", hub: "secondary", rent: 7000, tentpole: "Occasional", region: "US", studio: "Peachtree Pictures", pros: "A real production town with lower rent than the coasts.", cons: "Tentpoles are occasional, not the weekly mail.", awards: "US awards still count. The biggest junkets are a flight away." },
  { id: "london", city: "London", country: "United Kingdom", hub: "major", rent: 14000, tentpole: "Common", region: "UK", studio: "Thames Pictures", pros: "A capital for film and television, with BAFTA gravity.", cons: "Rent matches the coastal US cities.", awards: "An edge for BAFTA and UK talk shows." },
  { id: "manchester", city: "Manchester", country: "United Kingdom", hub: "local", rent: 5500, tentpole: "Rare", region: "UK", studio: "Irwell Films", pros: "Cheap rooms and a lively local television scene.", cons: "Studio blockbusters almost never start here.", awards: "UK shows and BAFTA are closer than the Oscars." },
  { id: "toronto", city: "Toronto", country: "Canada", hub: "secondary", rent: 8000, tentpole: "Occasional", region: "Canada", studio: "Harbour Canadian", pros: "A strong production hub with US-adjacent work.", cons: "The biggest offers still prefer Los Angeles.", awards: "Canadian festivals help. US campaigns are a step removed." },
  { id: "vancouver", city: "Vancouver", country: "Canada", hub: "secondary", rent: 7500, tentpole: "Occasional", region: "Canada", studio: "Raincity Pictures", pros: "Series and service work are common.", cons: "Tentpoles are occasional.", awards: "Local festivals first. US talk shows are rarer." },
  { id: "sydney", city: "Sydney", country: "Australia", hub: "secondary", rent: 8000, tentpole: "Occasional", region: "Australia", studio: "Southlight Pictures", pros: "English-language work and a real crew base.", cons: "Distance from the US junket circuit.", awards: "Local festivals carry more weight than Oscar week." },
  { id: "paris", city: "Paris", country: "France", hub: "secondary", rent: 9000, tentpole: "Occasional", region: "Europe", studio: "Seine Co-productions", pros: "European co-productions show up often.", cons: "Hollywood tentpoles are occasional.", awards: "European festivals. BAFTA is closer than the Oscars." },
  { id: "berlin", city: "Berlin", country: "Germany", hub: "local", rent: 6000, tentpole: "Rare", region: "Europe", studio: "Spree Pictures", pros: "Lower rent and a festival culture.", cons: "Big US series offers are rare.", awards: "A local festival edge, not an Oscar machine." },
  { id: "madrid", city: "Madrid", country: "Spain", hub: "local", rent: 5500, tentpole: "Rare", region: "Europe", studio: "Plaza Films", pros: "A cheaper shop with Spanish-language work.", cons: "Blockbusters are rare.", awards: "Local prizes travel further than US campaigns." },
  { id: "rome", city: "Rome", country: "Italy", hub: "local", rent: 6000, tentpole: "Rare", region: "Europe", studio: "Tevere Pictures", pros: "Prestige and co-productions over volume.", cons: "The phone is quieter on studio films.", awards: "Festival prizes more than US talk shows." },
  { id: "dublin", city: "Dublin", country: "Ireland", hub: "local", rent: 6500, tentpole: "Rare", region: "Europe", studio: "Liffey Films", pros: "English-language talent and modest rent.", cons: "You will wait on tentpoles.", awards: "UK-adjacent festivals. US shows are a trip." },
  { id: "mumbai", city: "Mumbai", country: "India", hub: "secondary", rent: 4500, tentpole: "Occasional", region: "India", studio: "Marine Drive Pictures", pros: "A deep local industry and low overhead.", cons: "Hollywood blockbusters are not the regular mail.", awards: "Local prizes. An international breakout is uncommon but real." },
  { id: "tokyo", city: "Tokyo", country: "Japan", hub: "local", rent: 11000, tentpole: "Rare", region: "Japan", studio: "Yamanote Films", pros: "A large home market.", cons: "Rent is high and US tentpoles are rare.", awards: "Local festivals. US campaigns get no home edge." },
  { id: "seoul", city: "Seoul", country: "South Korea", hub: "secondary", rent: 7000, tentpole: "Occasional", region: "Korea", studio: "Han River Pictures", pros: "A hot home industry that sometimes travels.", cons: "Studio Hollywood offers stay occasional.", awards: "Local prizes, with a small chance of an international lift." },
  { id: "lagos", city: "Lagos", country: "Nigeria", hub: "local", rent: 3500, tentpole: "Rare", region: "Nigeria", studio: "Lagoon Pictures", pros: "The cheapest major office, with a busy local slate.", cons: "Hollywood tentpoles are rare. You grow on home films.", awards: "Local festivals. A breakout can still lift the cast." },
  { id: "johannesburg", city: "Johannesburg", country: "South Africa", hub: "local", rent: 4000, tentpole: "Rare", region: "Africa", studio: "Highveld Pictures", pros: "Low rent and regional stories.", cons: "Big-budget offers are rare.", awards: "Local festivals over US campaigns." },
  { id: "mexico-city", city: "Mexico City", country: "Mexico", hub: "local", rent: 4500, tentpole: "Rare", region: "Mexico", studio: "Reforma Films", pros: "A large Spanish-language market and modest rent.", cons: "Tentpoles are rare.", awards: "Local and festival prizes." },
  { id: "dubai", city: "Dubai", country: "United Arab Emirates", hub: "local", rent: 10000, tentpole: "Rare", region: "Gulf", studio: "Creek Pictures", pros: "Money passes through, and service work exists.", cons: "High rent without a Hollywood offer flow.", awards: "No home edge on Oscar or BAFTA week." },
];

export function cityById(id: string | undefined): CityInfo | undefined {
  return CITIES.find((city) => city.id === id);
}

export function keepBigOffer(hub: HubRank, tier: string, filmStar: number, reputation: number, roll: number): boolean {
  if (tier !== "tentpole" && tier !== "studio") return true;
  if (hub === "major") return true;
  let drop = hub === "secondary" ? (tier === "tentpole" ? 0.7 : 0.38) : tier === "tentpole" ? 0.88 : 0.6;
  if (filmStar >= 80) drop -= 0.22;
  if (reputation >= 55) drop -= 0.1;
  drop = Math.max(0.12, Math.min(0.92, drop));
  return roll > drop;
}
