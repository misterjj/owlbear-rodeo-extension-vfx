# Visual Effects for Owlbear Rodeo

The GM, and players if the GM allows it, cast animated effects on the map, visible to the whole room.
They are computed by the graphics card, so there are no images to provide.

## Usage

Click **Effects** in Owlbear's top-left menu. The window has three tabs: **Cast**, **Programs** and
**Settings**. Programs is for the GM only, and players only see the language in Settings.

The **Cast** tab takes over the map as soon as you open it: choose the element, style and size, then click
the map. Your last choice is kept. Element and style open with a click, one at a time. Everything else
(exact area, lasting, wheel, lasting effects) stays folded, with a summary.

- **Element:** fire, ice, lightning, poison, acid, darkness, light, force, necrotic, psychic, thunder,
  physical, blood, water, earth, wind.
- **Style:**
  - strike, claws, bite, explosion, meteor, rain, dome, cube, cloud, aura, transformation and healing are
    cast with one click on the map;
  - arrow, projectile, beam, cone, wall and teleport take two clicks: the starting point, then the target
    or direction (`Escape` to cancel);
  - chain starts from the caster, then jumps to each new target you click (`Escape` to finish).
- **Size:** XS, S, M, L or XL. For area spells (explosion, meteor, rain, dome, cube, cloud, aura,
  transformation, healing, cone), an exact radius, length or side can be given in the scene's unit.

The **–** button shrinks the window to the essentials: the current effect, favorites to switch to, and
lasting effects. In the Programs tab, it becomes a list that turns programs on and off. If you pick another
tool, a message says so and **Resume** gives control back to the tab. Closing the window restores your
previous tool.

A cube cast from a token can be **centered** or **on a face**, as with *Thunderwave*. On a face, a second
click picks the direction, anywhere around the token: the cube sits against the token and faces it. When
attached, it follows the token without changing its orientation. On the map, it stays centered on the click.

An outline shows the affected area before casting. **Favorites** save a setup under a name, in this browser.
Reusing an existing name replaces it.

## Lasting effects

Aura, transformation, rain, dome, cube, cloud and wall can last: check **Lasting** in **More options**. The
effect then stays until removed, and is also visible to people who join during the game.

- Clicking a token attaches it: it follows the token and disappears with it. Clicking again turns it off.
- Clicking the map places it there. A wall is drawn with two clicks and always stays on the map.
- The **Lasting effects** list removes them one by one or all at once (10 per scene at most by default).

A lasting spell on the wheel turns on and off with a click on its sector. A darkness cloud is almost opaque,
even for the GM. With **Visible to the GM only**, players do not get it on their screen. These effects ignore
walls and do not change vision rules.

## Programs

A program recasts an effect on its own while it is active: a cannon firing every 3 seconds, or lightning
between two posts at varying intervals. The **Programs** tab lists them (10 per scene at most by default).
Each row starts or stops with ▶ and ■, and a whole group with **▶ All** and **■ All**.

- **Effect:** element, style, size or exact area.
- **Timing:** minimum and maximum interval, first shot offset, number of shots (empty: endless).
- **Points:** map positions or tokens, placed with a click. ▲ and ▼ change their order, and their number shows
  on the map while editing. A directed effect goes from the first point to the second. With more than two
  points, or for an area effect, the point is picked at random. A **chain**, however, goes through all its
  points in order: this counts as one shot, and the interval counts from its end. A hidden or deleted token
  is skipped.
- **Groups:** they turn on or off all at once. Programs activated together share the same start, so an offset
  makes them alternate.

Only the GM manages them, and sees a marker on the points of inactive programs. A shot only fires from a
visible point: a hidden or deleted token cancels it. Programs are purely visual. Effects cast by hand always
take priority.

## Token spells

Each token can keep up to 8 spells, shown on a wheel around it.

**During play:** click the token with the select tool, then **Spells** in its menu. Clicking a spell casts it.
Aura, transformation, healing, dome and lasting spells other than walls fire from the token at once. The others
wait for a click to aim, then you get your tool back (`Escape` to cancel).

**To prepare it:** select the token, or use **Choose a token on the map**, in the **Cast** tab. The **Wheel**
section lists its spells, which you edit with ✎ or remove with ✕. **+ Add** puts the effect set above on the
wheel. Spells are saved on the token: they follow it and work for anyone who controls it.

## GM settings

- **Visible to the GM only:** players see nothing and a teleport does not move the token.
- **Players can cast effects:** they get the Cast tab for the whole room. They can only teleport tokens that
  Owlbear lets them move by hand.
- **Limits per scene:** 10 lasting effects and 10 programs by default, from 1 to 100. A warning explains the
  cost: a lasting effect continuously uses every player's graphics card.

A teleport starting from a token moves it, snapped to the grid. Starting from any other point on the map, it
is purely visual.

Clicking a token aims at its center. Players have nothing to install, and effects stay hidden under fog of war.

## Language

The interface is available in English and French. It follows the browser's language, and each player can
change it in **Settings**. Names given to spells and favorites stay as written. To add a language, add a
dictionary in `src/i18n.ts`.

## Development

```sh
pnpm install
pnpm test
pnpm dev
```

To try it on your own in Owlbear Rodeo, add the custom extension `http://localhost:5174/manifest.json`, then
enable it in the room. Other participants cannot load a `localhost` address.

## Deployment (Cloudflare Pages, free)

First time only:

```sh
npx wrangler pages project create vfx-owlbear --production-branch master
```

Then, for each version:

```sh
pnpm run deploy
```

The manifest is then at `https://vfx-owlbear.pages.dev/manifest.json`, or at the address shown by the command
if that name is already taken.
