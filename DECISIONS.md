# Decisions

- Start years are 1995, 2005, and 2026. A year is 52 weeks. Advancing a month moves four weeks.
- Saves are JSON documents in Postgres, one per slot (five slots). The catalog stays in normalized tables. The engine never imports Prisma.
- Hidden traits are hashed from the TMDB id so they stay stable across saves. The roster only shows hints the scouts or verdicts have revealed.
- People with no birthday, or who died before the start year, are not eligible. "Today" also excludes anyone with a death date.
- Genre mix comes from `known_for` plus a cached set of popular and top-rated films, because person credits do not include genre ids. Romantic Comedy is added when Comedy and Romance co-occur. Superhero, Sports, and Biopic are game genres only.
- The player starts with an empty roster, $400,000, and three rivals who already represent 36 popular eligible actors. About 40 scored NPC films exist so the first awards season has nominees. World projects never attach the player's clients; that work arrives as offers.
- Commission is collected when photography starts, including each new season. Post-production and airing do not block the calendar. A personal hold does.
- A lapsed or released client stays in the save as unsigned, so verdicts, stats, and awards survive. Rivals are a separate agency. Re-signing the same person keeps that file.
- Representation can be non-exclusive. Jobs are still commissioned while the actor is signed. Non-exclusive clients are easier to poach.
- Gender 1 and 2 map to actress and actor categories. Unspecified genders compete in an open performance category.
- Studios, streamers, and review outlets are fictional. Ceremonies use their real names. The critics prize is the Critics Circle Awards. The booby prize is the Golden Raspberry Awards.
- An unresolved inbox event pauses "+1 week" and "until next event". The five-year simulator auto-resolves them.
- Binge series record every episode's viewership on the premiere week. Weekly series reveal one episode per turn.
- A few TMDB people have no portrait. The seed keeps paging until at least 2,000 actors and 300 directors have image paths. Anyone still missing a photo renders as initials.
- Opening staff list is empty. Scout level reveals that many trait hints per client each week.
