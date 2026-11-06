# Spellcast FX for Owlbear Rodeo

**Make every spell land.** Fireballs that roar, lightning that jumps from foe to foe, walls of ice that stay on
the map. The GM, and players if the GM allows it, cast animated effects in one click, and the whole room sees them.

### 👉 [See it in action on the guide site](https://vfx-owlbear.pages.dev/) · [Version française](https://vfx-owlbear.pages.dev/fr/)

The guide shows every feature in short videos, and lets you play all the effects right in your browser.

## What it does

- **16 elements × 20 styles:** strikes, claws, arrows, projectiles, beams, cones, explosions, meteors, walls, domes,
  auras, chains, teleports and more.
- **Lasting effects** that stay on the map or follow a token until you remove them, even for players who join later.
- **Token spells:** up to 8 spells saved on a token, cast from a wheel by anyone who controls it.
- **Programs** that recast effects on their own: a cannon firing every few seconds, a storm striking at random.
- **For the whole table:** players have nothing to install, effects stay hidden under fog of war, and the interface
  is in English and French.

## Install

From the Owlbear Rodeo store (coming soon), or as a custom extension with this address:

```
https://vfx-owlbear.pages.dev/manifest.json
```

Then enable it in your room, and open **Spellcast FX** in the top-left menu.

## Support

Spellcast FX is free, and will stay free. If it made your table gasp, you can help it grow on
**[Patreon](https://www.patreon.com/misterjj_obr)**: your support pays for new effects, new styles, and the time to
fix what you report. Found a bug or have an idea? [Open an issue](https://github.com/misterjj/owlbear-rodeo-extension-vfx/issues).

## Development

```sh
pnpm install
pnpm test
pnpm dev
```

To try it on your own in Owlbear Rodeo, add the custom extension `http://localhost:5174/manifest.json`, then
enable it in the room. Other participants cannot load a `localhost` address.
