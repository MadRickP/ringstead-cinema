# Ringstead Cinema website

A professional, static HTML website for Ringstead Cinema, designed for free hosting on Cloudflare Pages or GitHub Pages.

## What's included

- Responsive home page with the next screening and cinema information.
- Dedicated Holy Days film page.
- Interactive 5 x 7 seat map.
- Reservation form with £5-per-seat calculation.
- Demo booking mode using browser local storage.
- Optional live booking backend using Supabase (free tier).
- Past Films archive containing Hamnet and The Devil Wears Prada 2.
- Your Visit and About pages.

## Make reservations genuinely live

1. Create a free Supabase project.
2. Open the Supabase SQL Editor and run `supabase-schema.sql`.
3. Copy the Project URL and anon/public key from Supabase.
4. Put them into `config.js`:

```js
window.RINGSTEAD_CONFIG = {
  supabaseUrl: "YOUR_PROJECT_URL",
  supabaseAnonKey: "YOUR_ANON_KEY",
  screeningId: "holy-days-2026-11-06"
};
```

The public site can then read occupied seat IDs and create reservations through the database functions. Names, emails and phone numbers are not exposed by the public availability function.

## Local testing

Open `index.html` directly for the visual site. For the booking page, a simple local web server is preferable. From this folder, for example:

`python -m http.server 8000`

Then visit `http://localhost:8000/film.html`.

Without Supabase credentials, bookings are stored only in that browser as a demonstration. They are NOT live across different devices until Supabase is configured.

## Updating the next film

The easiest monthly workflow is to edit the HTML in `index.html` and `film.html`, replace the poster in `assets/`, change the date, synopsis and YouTube embed URL, and update `screeningId` in `config.js` plus the corresponding screening row in Supabase.

## Hosting

This is deliberately a plain HTML/CSS/JavaScript site, so it can be deployed directly to Cloudflare Pages or GitHub Pages with no server required for the front end.
