# v0.1 technology stack

This document records the technology decisions for the movie-matching MVP. The stack is intended to validate the core experience quickly: two people connect their phones to a TV screen through a QR code, vote on movies, and arrive at a shared choice.

## Agreed stack

| Area            | Technology                 | Purpose in v0.1                                                                              |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Main framework  | **Next.js**                | One application for the TV interface, mobile interface, and server-side logic/API            |
| UI library      | **React**                  | Interactive client interfaces                                                                |
| Language        | **TypeScript**             | Typed room, participant, movie, and vote data                                                |
| Styling         | **Tailwind CSS**           | Fast and consistent styling                                                                  |
| UI components   | **shadcn/ui**, selectively | Only for suitable foundational components; it is not a mandatory basis for the entire design |
| Database        | **Supabase Postgres**      | Store movies, rooms, participants, rounds, and votes                                         |
| Realtime        | **Supabase Realtime**      | Synchronize state between the TV screen and phones                                           |
| ORM             | **Drizzle ORM**            | Type-safe database schema and Postgres queries                                               |
| Validation      | **Zod**                    | Validate input at client and server boundaries                                               |
| Localization    | **next-intl**              | Centralize Ukrainian product messages and keep future locale expansion straightforward       |
| Hosting         | **Vercel**                 | Deploy the Next.js application                                                               |
| Package manager | **pnpm**                   | Manage dependencies and project commands                                                     |
| QR code         | **react-qr-code**          | Generate the room join QR code without scanner or external-service scope                     |

## Why Next.js and React

Next.js was chosen both as a technical solution and for the career value of React and Next.js experience. Since there is already experience with Vue, this project should provide practical experience in another major frontend ecosystem and result in a finished portfolio product.

That is not a reason to complicate the architecture: v0.1 remains a single Next.js application without a separate backend service.

## Why a server-side framework

Next.js is needed in v0.1 primarily **not for SEO**, but to keep the following in one application:

- TV and mobile pages;
- server-side logic and APIs;
- room creation and participant joining;
- vote validation and persistence;
- database access;
- secure handling of server secrets.

SEO may become useful later for public pages, but it is not the reason for choosing the framework for the MVP's main game flow.

## v0.1 architectural boundaries

- One repository and one Next.js application.
- No separate NestJS, Express, Fastify, or other backend service.
- Use Supabase for Postgres and realtime, not as a reason to add unnecessary services.
- Send commands and product mutations through validated Next.js server boundaries and Drizzle. Use the browser Supabase integration only for explicitly approved read or Realtime capabilities.
- Keep Supabase Data API access opt-in: browser roles receive no table writes, and any required reads must be protected by RLS and explicit least-privilege grants.
- Use shadcn/ui only when a ready-made component genuinely saves time.
- Keep `react-qr-code` limited to rendering join QR codes; do not add scanner or external-service scope without a concrete requirement.
- Keep `next-intl` configured for Ukrainian only in v0.1; do not add locale routing, a locale switcher, or another message catalog without a product decision.
- Add new technologies only for a concrete need in the current v0.1 specification.

## Outside this decision's scope

For v0.1, do not add microservices, a separate backend platform, a complex authentication system, queues, caches, a search engine, an analytics platform, or other infrastructure while the core game flow works without them.
