# Moderare — Oracolul Cenușii

Modulul de moderare este separat de joc. Oprirea jocului nu trebuie să oprească moderarea sau accesul staffului.

## Acces la panou

1. În Discord, folosește `/moderare login` pe serverul pe care îl administrezi.
2. Copiază codul primit în răspunsul privat al botului.
3. Deschide secțiunea **Moderare** din site (`/moderare`) și introdu codul.
4. Selectează serverul. Codul expiră după cinci minute și poate fi folosit o singură dată; sesiunea web expiră după opt ore.

Nu trimite codul altor persoane. Accesul depinde de apartenența și permisiunile curente din Discord, nu doar de existența unei sesiuni web. Configurarea și auditul sunt rezervate proprietarului; acesta poate permite și administratorilor accesul la aceste secțiuni.

Botul este oprit intenționat în mediul de dezvoltare al acestui proiect. Autentificarea prin Discord necesită instanța botului conectată; pagina de autentificare din preview nu oferă un ocol al permisiunilor.

## Activare

Modulele automate sunt dezactivate implicit. Configurează întâi:

- rolurile protejate și rolurile staff;
- canalele ignorate/protejate și canalele pentru alerte;
- pragurile de detecție și acțiunea dorită pentru fiecare regulă;
- permisiunile botului și poziția rolului său în ierarhia Discord.

Activează apoi modulul și regulile sale individuale. O regulă activă dintr-un modul oprit nu trebuie să aplice sancțiuni. Intensitatea Soft/Normal/Hard modifică sensibilitatea detecției, nu transformă singură avertismentele în banuri. Escaladarea sancțiunilor se configurează separat.

## Comenzi staff

`/warn`, `/mute`, `/kick`, `/ban`, `/unmute`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/nick`, `/role`.

Comenzile verifică permisiunile, ierarhia actorului și a botului și protecțiile configurate. Permisiunile de canal se aplică și acțiunilor lansate din site. Comenzile sunt slash commands Discord: prefixul lor este `/`.

Lockdown salvează permisiunile anterioare ale canalului pentru restaurare prin `/unlock`. Verifică rezultatele pe fiecare canal; lipsa unei permisiuni nu trebuie interpretată ca blocare reușită.

## Cazuri, loguri și audit

- **Cazuri:** sancțiuni, motive, dovezi, notițe și stare deschis/închis.
- **Loguri:** activitatea de moderare pentru staff.
- **Audit:** modificările și activitatea administrativă, cu acces mai restrictiv.

O cerere aflată în curs sau cu rezultat incert nu trebuie relansată automat: verifică întâi starea efectivă în Discord. Discord și baza de date nu pot participa la aceeași tranzacție.

## Limitări Discord

- Filtrarea mesajelor obișnuite necesită acces la **Message Content**; evenimentele membrilor necesită **Server Members**. Intențiile privilegiate trebuie permise atât în Discord Developer Portal, cât și în configurarea instanței botului.
- Timeout-ul cere **Moderate Members**; kick, ban, ștergerea mesajelor, rolurile și canalele au permisiuni Discord distincte. Rolul botului trebuie să fie suficient de sus.
- Evenimentele de ștergere sau schimbare de rol nu identifică întotdeauna sigur autorul acțiunii. În lipsa unei atribuiri verificabile, sistemul trebuie să alerteze stafful, nu să sancționeze persoana afectată.
- Animațiile embed sunt imagini GIF găzduite la un URL HTTPS, nu animații arbitrare ale textului sau ale interfeței Discord.
- Clasificarea AI poate greși. Folosește inițial alerte sau avertismente și verifică rezultatele înainte de a activa sancțiuni mai severe.