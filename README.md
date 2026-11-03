# Effets visuels pour Owlbear Rodeo

Le MJ, et les joueurs s'il les y autorise, lancent des effets animés sur la carte, visibles par toute la salle.
Ils sont calculés par la carte graphique : il n'y a aucune image à fournir.

## Utilisation

Prends l'outil **Effets** dans la barre d'outils : un panneau s'ouvre pour choisir trois réglages.
Le dernier choix est conservé.

- **Élément :** feu, glace, foudre, poison, acide, ténèbres, lumière, force, nécrotique, psychique,
  tonnerre, physique, sang, eau, terre, vent ;
- **Style :**
  - coup, griffes, morsure, explosion, pluie, dôme, aura et soin se lancent d'un clic sur la carte ;
  - flèche, projectile, rayon, cône, mur et téléportation demandent deux clics : le point de départ,
    puis la cible ou la direction (`Échap` pour annuler) ;
  - chaîne part du lanceur, puis saute à chaque nouvelle cible cliquée (`Échap` pour finir) ;
- **Taille :** XS, S, M, L ou XL. Pour un sort de zone (explosion, pluie, dôme, aura, soin, cône),
  un rayon ou une longueur exacte se donne dans l'unité de la scène.

Un contour montre la zone touchée avant de lancer. Les **favoris** enregistrent un réglage sous un
nom, dans ce navigateur ; reprendre un nom existant le remplace.

## Sorts d'un token

Chaque token peut garder jusqu'à 8 sorts, présentés sur une roue autour de lui. Pour l'ouvrir, clique
sur le token avec le mode **Roue des sorts** de l'outil, ou choisis **Sorts** dans son menu. Le bouton
⚙ au centre gère la liste : tu y ajoutes le réglage en cours sous le nom de ton choix ou un favori,
et tu renommes les sorts directement dans leur champ.

Aura, soin et dôme partent aussitôt du token. Les autres attendent un clic pour viser, puis tu
retrouves l'outil que tu avais (`Échap` pour annuler). Les sorts sont enregistrés sur le token : ils
le suivent et servent à tous ceux qui ont la main dessus.

## Options du MJ

- **Visible par le MJ seulement :** les joueurs ne voient rien et une téléportation ne bouge pas le token ;
- **Les joueurs peuvent lancer des effets :** l'outil apparaît chez eux, pour toute la salle. Ils ne
  déplacent par téléportation que les tokens qu'Owlbear les laisse déplacer à la main.

Une téléportation qui part d'un token le déplace, calé sur la grille. Partie d'un autre point
de la carte, elle reste purement visuelle.

Si le panneau a été fermé, le bouton **Réglages** de l'outil le rouvre.
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
