# Spellcast FX for Owlbear Rodeo

The GM, and players if the GM allows it, cast animated effects on the map, visible to the whole room.
They are computed by the graphics card, so there are no images to provide.

## Usage

Click **Spellcast FX** in Owlbear's top-left menu. The window has three tabs: **Cast**, **Programs** and
**Settings**. Programs is for the GM only, and players only see the language in Settings.

The **Cast** tab takes over the map as soon as you open it: choose the element, style and size, then click
the map. Your last choice is kept. Element and style open with a click, one at a time. Everything else
(exact area, lasting, wheel, lasting effects) stays folded, with a summary.

- **Element:** fire, ice, lightning, poison, acid, darkness, light, force, necrotic, psychic, thunder,
  physical, blood, water, earth, wind.
- **Style:**
  - strike, claws, bite, explosion, meteor, flame, rain, dome, cube, cloud, aura, transformation and healing are
    cast with one click on the map;
  - arrow, projectile, beam, cone, wall and teleport take two clicks: the starting point, then the target
    or direction (`Escape` to cancel);
  - chain starts from the caster, then jumps to each new target you click (`Escape` or **Finish chain** to end).
- **Direction:** in **More options**, strike and claws are **Random**, or **Fixed** with a slider from 0 to 360 degrees,
  read like a compass (0 up, 90 right).
- **Size:** XS, S, M, L or XL. For area spells (explosion, meteor, flame, rain, dome, cube, cloud, aura,
  transformation, healing, cone), an exact radius, length or side can be given in the scene's unit.

The **–** button shrinks the window to the essentials: the current effect, favorites to switch to, and
lasting effects. In the Programs tab, it becomes a list that turns programs on and off. If you pick another
tool, a message says so and **Resume** gives control back to the tab. Closing the window restores your
previous tool. **Stop casting** does the same without closing the window, and **Cancel aiming** drops a first point
already placed. `Escape` does the same: it cancels the aim if there is one, otherwise it stops casting. Reloading the
page does not take over the map: **Resume** does.

A cube cast from a token can be **centered** or **on a face**, as with *Thunderwave*. On a face, a second
click picks the direction, anywhere around the token: the cube sits against the token and faces it. When
attached, it follows the token without changing its orientation. On the map, it stays centered on the click.

An outline shows the affected area before casting. **Favorites** save a setup under a name, in this browser.
Reusing an existing name replaces it.

## Lasting effects

Every style can last: check **Lasting** in **More options**. The effect then stays until removed, and is also
visible to people who join during the game. Each style lasts in its own way:

- aura, transformation, flame, rain, dome, cube, cloud, wall, beam, chain, cone and healing keep running;
- arrow, strike, claws, bite, projectile, explosion and meteor play their animation once, then leave a trace: a
  planted arrow, claw or fang marks, or scorched ground with embers and small flames;
- teleport replays in a loop, with a short pause, and never moves a token.

- Clicking a token attaches it: it follows the token and disappears with it. Clicking again turns it off.
- Clicking the map places it there. Effects with two points (wall, beam, cone…) take two clicks and always stay
  on the map. A lasting chain leaves one effect per jump, until `Escape`.
- The **Lasting effects** list shows the token carrying each one, and where it comes from (a program and its group, a
  token's spell, or the player who cast it). It removes them one by one or all at once (10 per scene at most by default), and hovering
  a remove button highlights what it would remove.

A lasting spell attached to its token turns on and off with a click on its sector. If it was placed elsewhere, such
as a wall, the sector lights up and a click opens a second wheel: **New**, each active effect by number (hovering one
highlights it on the map), **Stop all**, and **Back** to return to the spells. The wheel lists the 9 most recent. A darkness cloud is almost opaque,
even for the GM. With **Visible to the GM only**, players do not get it on their screen. These effects ignore
walls and do not change vision rules.

## Programs

A program recasts an effect on its own while it is active: a cannon firing every 3 seconds, or lightning
between two posts at varying intervals. The **Programs** tab lists them (10 per scene at most by default).
Each row starts or stops with ▶ and ■, and a whole group with **▶ All** and **■ All**.

- **Effect:** element, style, size or exact area.
- **Timing:** minimum and maximum interval, first shot offset, number of shots (empty: endless).
- **Points:** map positions or tokens, placed with a click. Drag a point on the map to move it, while placing
  points. ▲ and ▼ change their order, and their number shows on the map while editing. A directed effect goes from the first point to the second. With more than two
  points, or for an area effect, the **point order** is random or in sequence: in sequence, each shot moves to
  the next point (a directed effect links each point to the next), then loops. A **chain**, however, always
  goes through all its points in order: this counts as one shot, and the interval counts from its end. A hidden
  or deleted token is skipped.
- **Permanent effect:** each point keeps its effect until the next shot of this program on that point removes it
  and starts it again, so the interval sets the rhythm. Effects that keep running appear on their own, as one
  continuous effect. ■ removes them; when a shot count runs out they stay, and the row offers ■
  to remove them. They count toward the lasting effects limit (a shot on a new point is skipped once it is
  reached), each style lasts as described above, and a GM must be connected for new shots to land.
- **Groups:** they turn on or off all at once. Programs activated together share the same start, so an offset
  makes them alternate.

Only the GM manages them, and sees a marker on the points of inactive programs. A shot only fires from a
visible point: a hidden or deleted token cancels it. Programs are purely visual. Effects cast by hand always
take priority.

## Token spells

Each token can keep up to 8 spells, shown on a wheel around it.

**During play:** click the token with the select tool, then **Spells** in its menu. Clicking a spell casts it.
Effects that are not directed have a **Target**, set with ✎: **On the token** fires at once from the token, **Aim it**
waits for a click on another token or on the map, as for a shield cast on an ally. Aura, transformation, healing and
dome start on the token, the others are aimed. Directed effects start from the token, except a wall, which takes two
free clicks on the map. Spells that aim
wait for a click to aim, then you get your tool back (`Escape` to cancel).

**To prepare it:** select the token, or use **Choose a token on the map**, in the **Cast** tab. The **Wheel**
section lists its spells, which you edit with ✎ or remove with ✕. **+ Add** puts the effect set above on the
wheel. Spells are saved on the token: they follow it and work for anyone who controls it.

## GM settings

- **Visible to the GM only:** players see nothing and a teleport does not move the token.
- **Players can cast effects:** they get the Cast tab for the whole room. They can only teleport tokens that
  Owlbear lets them move by hand.
- **Limits per scene:** 10 lasting effects, 10 programs and 10 simultaneous effects by default, from 1 to 100. A
  warning explains the cost: a lasting effect continuously uses every player's graphics card.
- **Simultaneous effects:** how many animated effects can play at once on each machine, lasting effects aside.
  Beyond that, a new effect is ignored. Players and programs stop 2 short of the limit, so the GM can always cast.

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
