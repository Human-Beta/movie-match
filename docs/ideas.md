# Ideas for future versions

This file is the home for ideas that are outside v0.1.

Rule: if an idea is interesting but complicates the MVP, put it here instead of adding it to the current scope.

---

## Game modes

### Blind Date Mode

Show a movie without its title or poster.

Participants see only:

- genre;
- year or time period;
- runtime;
- one actor;
- a short spoiler-free description of the vibe.

Reveal the title only after a match.

Example:

> Genre: thriller / science fiction  
> Year: after 2010  
> Runtime: under two hours  
> Actor: Jake Gyllenhaal  
> Vibe: “After the ending, you will want to spend twenty minutes discussing what just happened.”

---

### Chaos Mode

A mode that activates when participants cannot agree for a long time.

If several rounds pass without a choice, the system becomes less democratic and starts offering strange themed rounds.

Examples:

- only Nicolas Cage movies;
- only movies under 100 minutes;
- only old movies;
- only comedies;
- only movies with strange posters;
- only movies with one-word titles;
- only movies the system considers “good enough”;
- the system chooses the next three movies itself.

Possible messages:

- “You have lost the right to a normal choice.”
- “Chaos Mode is on. This is your fault.”
- “The next round will be strange.”
- “Democracy failed. Time for chaos.”

---

### Final Duel

If there is no match for a long time, the system takes several of the least divisive choices and starts a final duel.

Example:

1. Movie A versus Movie B.
2. The winner versus Movie C.
3. The system announces the winner.

The goal is to prevent endless rounds.

---

### Veto tokens

Instead of unlimited `❌` votes, each participant could receive a limited number of vetoes for the evening.

For example:

- three vetoes per session;
- `❌` becomes unavailable after they are used;
- the participant can then vote only `😐`, `🙂`, or `🔥`.

This could make the choice more playful and slightly more tense.

---

### Solo Mode

A mode for one person who cannot decide what to watch.

This is only an idea for now. It is not yet clear whether it should be implemented.

Possible flow:

1. The user opens the website.
2. They select simple filters:
   - genre;
   - under two hours;
   - new / old;
   - available on Netflix;
   - light / serious.
3. The website shows three movies.
4. The user reacts to each one:
   - 🔥 want to watch;
   - 🙂 could watch;
   - 😐 not now;
   - ❌ no.
5. If the user votes `🔥`, the movie may become the recommendation.
6. If the user rejects many movies, the system starts joking and nudging them toward a decision.

Possible messages:

- “You have rejected twelve movies. Are the movies definitely the problem?”
- “Okay, one more round. This is starting to look like procrastination.”
- “That is enough. Watch this one, and do not open another list.”
- “You do not need a movie. You need a vacation from making choices.”

---

## Watchlists

Possible features:

- My watchlist;
- Our watchlist;
- whether one participant or both added a movie;
- a “want to watch” status;
- an “already watched” status;
- a “not interested” status;
- filtering by the shared watchlist only.

Questions for later:

- Are accounts required?
- How should a pair of users be represented?
- Could the flow start with magic links?
- Could watchlists be stored locally at first?
- How should watchlists synchronize between people?

---

## Post-watch ratings

The idea is to avoid scores from 1 to 10 because people often do not want to debate whether something was a seven or an eight.

Use emoji ratings instead:

- 🖤 favorite;
- 🔥 loved it;
- 🙂 fine;
- 😐 meh;
- 😴 boring;
- 🤡 bad but funny;
- 💀 never again.

Possible features:

- a rating from each participant;
- a shared rating for the pair;
- a favorites list;
- a “never again” list;
- recommendations based on emoji ratings.

---

## Browser extension

Add a browser extension for quickly saving movies to a watchlist.

Flow:

1. A user sees a movie title on any website.
2. They select the text.
3. They right-click.
4. They choose “Add to list.”
5. The extension finds the movie in the database or through an API.
6. The user confirms the result.
7. The movie is added to a watchlist.

This makes sense only after watchlists and a proper movie import flow exist.

---

## Database content

### API imports

Connect an external movie API in a future version.

Flow:

1. An admin enters a movie title.
2. The system searches for the movie.
3. The admin confirms the correct result.
4. The system automatically saves:
   - title;
   - year;
   - poster;
   - description;
   - genres;
   - runtime;
   - rating;
   - cast;
   - images.

This avoids maintaining all movie data manually.

---

### AI mood tags

AI should not be used as a source of factual movie data.

Bad uses:

- AI generates the release year;
- AI generates the cast;
- AI invents a poster;
- AI invents facts.

Good uses:

- an API supplies factual data;
- AI adds mood tags and informal descriptions.

Example mood tags:

- light;
- heavy;
- date night;
- works in the background;
- do not watch before bed;
- silly but fun;
- something smart;
- not depressing;
- after-work viewing.

---

## Streaming services

A future version could provide better support for movie availability on streaming services.

Possible services:

- Netflix;
- Apple TV;
- Prime Video;
- Megogo;
- Sweet.tv;
- YouTube Movies;
- Google TV.

Availability may remain a manual field initially.

Later, the product may use an API or semi-automatic updates.

Important: streaming availability changes over time and varies by country.

---

## Humor and product copy

### No-match messages

- “No match. It looks like Netflix won tonight.”
- “You disagree again, but we are still trying.”
- “These three did not pass the audition.”
- “Okay, let us keep looking.”
- “Democracy is complicated.”
- “Still no movie, but at least you have character.”
- “This round is officially going in the trash.”
- “Nobody was hurt except your evening.”
- “There was an attempt. It was not a good one.”
- “Your tastes have wandered into different rooms again.”

### Match messages

- “You agreed. That is almost a miracle.”
- “Enough democracy. Press play.”
- “Start watching before someone changes their mind.”
- “Shared choice found. Do not ruin the moment.”
- “It is not the perfect choice. It is the choice that finally happened.”
- “Congratulations. You defeated scrolling.”
- “The movie is chosen. You can put the phone down now.”
- “The decision is made. Do not open another list.”
- “This is your movie for tonight. At least according to the system.”
- “Scrolling lost. The movie won.”

### Room-full messages

- “The room is full. This movie battle is only for two.”
- “Three is a crowd, at least in this room.”
- “No seats left. Try creating your own room.”

### Expired-room messages

- “The room closed. You had an hour.”
- “Time is up. You never chose a movie. Sad, but fair.”
- “Session over. Scrolling won.”

When these messages are implemented for v0.1, their shipped versions should be Ukrainian rather than literal translations of the examples above.

---

## Design direction

Possible directions:

- dark background;
- large text for the TV;
- large movie cards;
- very few small controls;
- emoji as part of the UI;
- a subtle meme-like style;
- informal messages;
- quick controls on phones.

The product should feel like evening entertainment, not productivity SaaS.

---

## TV device detection

A future version could recognize likely TV browsers and offer to open the TV flow automatically.

Possible signals to investigate include the user agent, User-Agent Client Hints where available, display and input characteristics, installed-app context, or platform-specific TV browser APIs. Browser detection is not fully reliable, so any automatic redirect should have a safe fallback and a visible way to choose or leave TV mode manually.

This idea should be validated on the actual target TV platforms before it becomes product behavior.

---

## Localization

v0.1 ships in Ukrainian only, but the product should support additional languages in later versions.

Future considerations:

- choose the first additional languages based on real users;
- keep Ukrainian as a first-class language;
- localize humor and tone rather than translating jokes literally;
- extend the existing `next-intl` message catalog without adding locale routing or a language switcher until a future product decision requires them.

---

## Potential names

The product name is not final.

Possible naming directions:

- the couch;
- the evening;
- matching;
- a movie battle;
- ending the scroll;
- choosing a movie.

Names can be discussed separately.

---

## Monetization

Monetization is not an initial priority.

Possible ideas:

- donations;
- a Pro version;
- custom themes;
- custom game modes;
- affiliate links;
- streaming-service partnerships;
- paid shared watchlists.

The main goal of the early versions is to build a product people want to use.
