---
brief: "Application mobile développée pour Stimshop et son client Orano permettant de gérer les boitiers de mesure d'épaisseur UMIT"
client: "clt-stimshop"
heroImage: "../../assets/images/umix-menu.jpg"
heroImageAlt: "Copie d'écran du menu principal de l'application"
name: "Application mobile UMIT"
running: false
slug: "umit"
startDate: "2020-09-10"
endDate: "2021-02-15"
roles:
  - "role-moa"
  - "role-moe"
  - "role-cto"
categories:
  - "cat-iot"
  - "cat-mobile-app"
technos:
  - "tech-react-native"
  - "tech-sqlite"
  - "tech-watermelon"
---

Cette application a été développée en React Native et permet de se connecter à des boitiers de mesure d'épaisseur UMIT.

Ces boitiers se connectent en bluetooth et effectuent une mesure d'épaisseur d'un tuyau ou d'un réservoir.

Les données de mesure sont envoyées à l'application qui exécute un algorithme A-Scan pour déterminer l'épaisseur mesurée.

Cette mesure et les données sont ensuite synchronisables avec le serveur UCheckIn que j'ai également développé.

![menu principal de l'application](../../assets/images/umix-menu.jpg)

![Détection](../../assets/images/umix-detection.jpg)

![mesure](../../assets/images/umix-mesure.jpg)

![Journal des mesures](../../assets/images/umix-journal-mesures.jpg)

![synchronisation web](../../assets/images/umix-synchro.jpg)
