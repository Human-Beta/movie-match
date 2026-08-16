# Product vision

## In short

Movie Match is a web service for choosing a movie for the evening.

The problem: people often spend too long scrolling through Netflix, Google, IMDb, Megogo, and other services, arguing about what to watch, and eventually either waste a lot of time or watch nothing at all.

The product turns choosing a movie into a simple game: open the website on a TV, connect two phones through a QR code, vote on movies in rounds, and find a shared choice.

The main value is not a “perfect recommendation algorithm.” It is helping two people agree quickly, playfully, and without unnecessary deliberation.

The initial release is Ukrainian-language only. The tone is informal, light, and humorous. Additional product languages are planned for later versions.

---

## Main flow

1. A user opens the website on a TV.
2. The website creates a room with a short code and QR code.
3. Two people join from their phones.
4. The first participant configures simple filters.
5. The TV shows three movies per round.
6. Each person votes privately from their phone.
7. If they share a positive choice, the website shows a match.
8. If there is no match, the website shows the next three movies.

---

## Target audience

The primary audience is:

- couples who often watch movies together;
- friends or roommates choosing a movie for the evening;
- people tired of endlessly scrolling through streaming catalogs;
- anyone who wants to make choosing a movie a little more fun.

The initial focus is specifically on two people.

The first version does not focus on:

- large groups;
- a social network;
- a comprehensive movie database;
- sophisticated recommendations;
- personal profiles;
- monetization.

---

## Positioning

This is not a movie catalog.  
This is not a competitor to IMDb, Letterboxd, or Netflix.  
This is not a complex recommendation service.

It is a small game that helps people finally choose a movie.

The core promise:

> Stop scrolling. Choose a movie through a game.

---

## Product principles

### 1. The game comes before the database

Do not start with a large movie database, complex API, accounts, or recommendations. First validate whether the TV-and-phones selection flow feels fun.

### 2. The MVP must be complete

Version 0.1 should be small but complete. A user must be able to finish the entire flow: create a room, connect phones, vote, and get a match.

### 3. Minimize friction

v0.1 does not need accounts, email, passwords, profiles, or onboarding. A person should simply open the website and start.

### 4. Humor matters

The product should feel informal. On-screen messages may be a little cheeky or meme-like, but never toxic.

### 5. Do not expand the scope

Every proposed feature must answer:

- Is it required for v0.1?
- Does it complicate the MVP?
- Can it be deferred to `ideas.md`?
- Can it be made simpler?

---

## Current focus

The current focus is v0.1.

v0.1 must validate the central assumption:

> Is choosing a movie through a TV and two phones enjoyable and convenient when presented as a simple game?

v0.1 does not include:

- accounts;
- watchlists;
- post-watch ratings;
- sophisticated recommendations;
- the TMDB API;
- a browser extension;
- Blind Date Mode;
- Chaos Mode;
- Final Duel;
- group mode;
- monetization;
- languages other than Ukrainian.

---

## Roadmap

### v0.1 — the basic game

- TV room.
- QR code.
- Two connected phones.
- Host-configured filters.
- Three Cards Mode.
- Private voting.
- Match/no match.
- Random humorous messages.
- Manually maintained movie database.
- Ukrainian-language interface.

### v0.2 — more game mechanics and humor

- Blind Date Mode.
- Chaos Mode.
- Final Duel.
- Limited vetoes.
- A timer showing how long the users have been choosing.
- More humorous messages.

### v0.3 — a proper content pipeline

- Import movies through an external API.
- Automatically fetch year, poster, genres, runtime, and cast.
- A simple admin page for adding movies.

### v0.4 — watchlists

- My watchlist.
- Our watchlist.
- Movie statuses.
- Filter by shared watchlist.
- Possibly simple accounts.

### v0.5 — post-watch ratings

- Emoji ratings instead of numbers.
- Watch history.
- Simple favorite / meh / never again lists.

### v0.6 — browser extension

- Select a movie title on any website.
- Right click → add to a list.
- Find the movie through an API.
- Add it to a watchlist.

### v0.7 — streaming services

- Better support for Netflix, Apple TV, Prime Video, Megogo, Sweet.tv, and others.
- Manual or semi-automatic availability data.
- A “can watch right now” filter.

### Later — localization

- Add languages beyond Ukrainian.
- Keep product copy and humor culturally appropriate rather than relying on literal translation.
- Preserve Ukrainian as a first-class product language.

---

## Monetization

Monetization is not an initial priority.

Possible future options include:

- donations;
- a small Pro version;
- paid custom game modes;
- paid themes;
- streaming-service partnerships;
- affiliate links.

The first priority is a complete, fun product that people genuinely use.
