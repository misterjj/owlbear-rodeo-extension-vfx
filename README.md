# Effets visuels pour Owlbear Rodeo

Le MJ lance des effets animés sur la carte, visibles par toute la salle.
Ils sont calculés par la carte graphique : il n'y a aucune image à fournir.

## Utilisation

Prends l'outil **Effets** dans la barre d'outils :

- **Explosion de feu :** clique sur la carte ;
- **Projectile de feu :** clique sur le lanceur, puis sur la cible (`Échap` pour annuler).

Un clic sur un token vise son centre. Les joueurs n'ont rien à installer, mais un effet
se voit même sous le brouillard de guerre.

## Développement

```sh
pnpm install
pnpm test
pnpm dev
```

Pour essayer seul dans Owlbear Rodeo, ajoute l'extension personnalisée
`http://localhost:5174/manifest.json`, puis active-la dans la salle. Les autres
participants ne peuvent pas charger une adresse `localhost`.

## Mise en ligne (Cloudflare Pages, gratuit)

La première fois seulement :

```sh
npx wrangler pages project create vfx-owlbear --production-branch master
```

Puis, à chaque version :

```sh
pnpm run deploy
```

Le manifest est alors à l'adresse `https://vfx-owlbear.pages.dev/manifest.json`, ou à
l'adresse affichée par la commande si ce nom est déjà pris.
