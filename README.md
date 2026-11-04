# Effets visuels pour Owlbear Rodeo

Le MJ, et les joueurs s'il les y autorise, lancent des effets animés sur la carte, visibles par toute la salle.
Ils sont calculés par la carte graphique : il n'y a aucune image à fournir.

## Utilisation

Clique sur **Effets**, dans le menu en haut à gauche d'Owlbear. La fenêtre a trois onglets : **Lancer**,
**Programmes** et **Réglages** (les deux derniers pour le MJ). L'onglet **Lancer** prend la main sur la
carte dès qu'on y arrive : choisis l'élément, le style et la taille, puis clique sur la carte. Le dernier choix est conservé. Élément et style s'ouvrent d'un clic, un à la fois ; le reste (zone exacte, durable, roue, effets durables) est replié avec son résumé.

- **Élément :** feu, glace, foudre, poison, acide, ténèbres, lumière, force, nécrotique, psychique,
  tonnerre, physique, sang, eau, terre, vent ;
- **Style :**
  - coup, griffes, morsure, explosion, météore, pluie, dôme, cube, nuage, aura, transformation et soin se lancent d'un clic sur la carte ;
  - flèche, projectile, rayon, cône, mur et téléportation demandent deux clics : le point de départ,
    puis la cible ou la direction (`Échap` pour annuler) ;
  - chaîne part du lanceur, puis saute à chaque nouvelle cible cliquée (`Échap` pour finir) ;
- **Taille :** XS, S, M, L ou XL. Pour un sort de zone (explosion, météore, pluie, dôme, cube, nuage, aura, transformation, soin,
  cône), un rayon, une longueur ou un côté exact se donne dans l'unité de la scène.

Le bouton **–** réduit la fenêtre à l'essentiel : l'effet en cours, les favoris pour en changer et les
effets durables ; l'onglet Programmes se limite à une liste qui active ou désactive. Si tu prends un autre
outil, un message le signale et **Reprendre** rend la main à l'onglet. Fermer la fenêtre rend l'outil d'avant.

Un cube lancé depuis un token peut être **au centre** ou **sur une face**, comme pour *Vague tonnante* :
sur une face, un second clic choisit la direction, n'importe où autour du token : le cube se colle à lui
et lui fait face. Attaché, il le suit sans changer d'orientation. Sur la carte, il reste centré sur le clic.

Un contour montre la zone touchée avant de lancer. Les **favoris** enregistrent un réglage sous un
nom, dans ce navigateur ; reprendre un nom existant le remplace.

## Effets durables

Aura, transformation, pluie, dôme, cube, nuage et mur peuvent durer : coche **Durable** dans le panneau. L'effet reste alors
jusqu'à ce qu'on le retire, et se voit aussi pour ceux qui arrivent en cours de partie.

- Un clic sur un token l'y attache : il le suit et disparaît avec lui. Un nouveau clic l'éteint.
- Un clic sur la carte l'y pose. Un mur se trace en deux clics et reste toujours sur la carte.
- La liste **Effets durables** du panneau retire chacun d'eux, ou tous d'un coup (8 au plus par scène).

Un sort durable de la roue s'allume et s'éteint d'un clic sur son bouton. Un nuage de ténèbres est
presque opaque, y compris pour le MJ. Avec **Visible par le MJ seulement**, les joueurs ne le reçoivent
pas à l'écran. Ces effets ne connaissent pas les murs et ne changent rien aux règles de vision.

## Programmes

Un programme relance un effet tout seul, tant qu'il est actif : un canon qui tire toutes les 3
secondes, ou des éclairs entre deux poteaux à intervalle variable. L'onglet **Programmes** les liste
(8 au plus par scène). Chaque ligne se lance ou s'arrête avec ▶ et ■, et un groupe entier avec **▶ Tout** et **■ Tout**.

- **Effet :** élément, style, taille ou zone exacte.
- **Rythme :** intervalle minimum et maximum, décalage du premier tir, nombre de tirs (vide : sans fin).
- **Points :** des positions sur la carte ou des tokens, placés d'un clic. Un effet dirigé va du premier
  au second ; avec plus de deux points, ou pour un effet de zone, le point est tiré au hasard. Une
  **chaîne** parcourt au contraire tous ses points dans l'ordre : c'est un seul tir, et l'intervalle
  compte à partir de sa fin. Un token caché ou supprimé est sauté.
- **Groupes :** ils s'activent ou se désactivent d'un coup. Les programmes activés ensemble partagent le
  même départ, ce qui permet de les faire alterner avec le décalage.

Seul le MJ les gère, et il voit un repère sur les points des programmes inactifs. Un tir ne part que
d'un point visible : un token caché ou supprimé l'annule. C'est uniquement visuel. Les effets lancés à
la main restent prioritaires.

## Sorts d'un token

Chaque token peut garder jusqu'à 8 sorts, présentés sur une roue autour de lui.

**Pendant la partie :** clique sur le token avec l'outil de sélection, puis sur **Sorts** dans son menu. Un
clic sur un sort le lance. Aura, transformation, soin, dôme et les sorts durables autres que le mur partent
aussitôt du token ; les autres attendent un clic pour viser, puis tu retrouves ton outil (`Échap` pour annuler).

**Pour la préparer :** sélectionne le token, ou utilise **Choisir un token sur la carte**, dans l'onglet
**Lancer**. La section **Roue de…** liste ses sorts, que tu modifies avec ✎ ou retires avec ✕. **+ Ajouter à la
roue** y met l'effet réglé juste au-dessus. Les sorts sont enregistrés sur le token : ils le suivent et servent
à tous ceux qui ont la main dessus.

## Réglages du MJ

- **Visible par le MJ seulement :** les joueurs ne voient rien et une téléportation ne bouge pas le token ;
- **Les joueurs peuvent lancer des effets :** l'outil apparaît chez eux, pour toute la salle. Ils ne
  déplacent par téléportation que les tokens qu'Owlbear les laisse déplacer à la main.

Une téléportation qui part d'un token le déplace, calé sur la grille. Partie d'un autre point
de la carte, elle reste purement visuelle.

Un clic sur un token vise son centre. Les joueurs n'ont rien à installer, et un effet
reste caché sous le brouillard de guerre.

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
