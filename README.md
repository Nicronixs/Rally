# Rally Koop

3D-Rally im Browser (Three.js + Rapier). Ziel: Online-Koop, bei dem einer fährt und der andere als Beifahrer den Aufschrieb vorliest.

**Online spielen:** https://nicronixs.github.io/Rally/ – wird bei jedem Push auf `main` automatisch neu veröffentlicht (`.github/workflows/pages.yml`).

## Starten

```
npm install
npm run dev
```

Dann http://localhost:5173 öffnen. Im Hauptmenü gibt es **Meisterschaft**, **Freie Fahrt** und **Koop**.

Direkt per Adresse: `?seed=123&env=snow&car=bison&go=1` (Strecke, Untergrund `forest`/`snow`/`tarmac`/`desert`, Auto `falke`/`fuchs`/`bison`, sofort starten). `?autopilot` lässt das Auto selbst fahren (zum Testen).

## Meisterschaft

4 Rallyes (Nordwald/Schotter, Schneeland/Schnee, Alpenpass/Asphalt, Sandmeer/Wüste) mit je 3 Wertungsprüfungen gegen 7 fiktive Gegner. Nach jeder Rallye gibt es Punkte (25-18-15-12-10-8-6-4-2-1). Repariert wird nur zwischen den Rallyes: nach der letzten Prüfung einer Rallye gibt es 45 Minuten Service für Motor, Fahrwerk und Karosserie – was nicht repariert wird, bleibt. Zwischen den Prüfungen einer Rallye fährt man mit dem Schaden weiter. Kein Neustart; R (Bergung) kostet 5 s.

**Strafen wie bei einer echten Rallye** (nach den FIA WRC Sporting Regulations):
- **Frühstart** (Art. 48.6): Wer vor „LOS!“ losfährt – am Start halten die Bremsen das Auto, bis man Gas gibt –, bekommt 10 s, beim zweiten Mal 1 min, ab dem dritten Mal 3 min (in der Meisterschaft über alle Prüfungen gezählt).
- **Abkürzen** (Art. 19.2): Von der Straße abkommen und wieder auffahren kostet nur Zeit. Wer aber weiter vorne wieder auf die Straße kommt, als er sie verlassen hat, und dabei mehr als 12 m spart, bekommt +5 s, jedes weitere Mal +10 s – mindestens aber das 1,5-Fache der gesparten Zeit, damit sich Abkürzen nie lohnt.
- **Zu lange neben der Strecke:** Wer 5 Sekunden abseits der Route ist (mehr als 4 m über den Straßenrand hinaus), wird dort auf die Straße zurückgesetzt, wo er sie verlassen hat, und bekommt +5 s. Ein Countdown im Hinweis zeigt die verbleibende Zeit. Einstellbar mit `OFF_RESET_TIME` und `OFF_RESET_PENALTY`.
- **Aufgeben** (Art. 54, nur Meisterschaft): Esc während einer Prüfung → die Prüfung zählt mit der Bestzeit + 10 Minuten, die Rallye geht weiter.
- **Bergung** mit R: +5 s (Meisterschaft).

Einstellbar in `src/championship.js` (`CUT_*`, `JUMP_START_PENALTIES`, `RETIRE_PENALTY`).

**Schaden:** Harte Treffer (Bäume, Felsen, Überschläge) beschädigen das Auto. Frontal trifft vor allem den Motor (weniger Leistung, ab 45 % raucht er), seitlich das Fahrwerk (weniger Grip, zieht zur Seite), alles die Karosserie (dreckig, Heckflügel fällt ab).

**Gegnerzeiten** werden aus einer Referenzzeit pro Prüfung berechnet (Kurvenradien, Beschleunigung, Bremsen, Grip des Untergrunds) mal Können des Gegners plus etwas Zufall und gelegentlichen Fehlern.

## Preisgeld und Garage

In der Meisterschaft gibt es Preisgeld (Spielwährung, gespeichert im Browser):
- nach jeder Rallye für die Platzierung: 25.000 / 18.000 / 15.000 / 12.000 / 10.000 / 8.000 / 6.000 / 4.000 €
- am Ende der Meisterschaft eine Prämie für den Endstand: 100.000 / 60.000 / 40.000 / 25.000 / 15.000 / 10.000 / 5.000 / 2.000 €

Man startet mit dem **Fuchs R2** und 15.000 €. Im Menü-Reiter **Garage** kauft man:
- **Autos** (jedes besser als das vorige):

| Auto | Antrieb | Preis | PI Serie | PI voll getunt | 0–100 | Spitze |
|---|---|---|---|---|---|---|
| Fuchs R2 | Front | Startauto | C 558 | A 711 | 4,8 s | 187 km/h |
| Bison Klassik | Heck | 40.000 € | C 559 | B 674 | 4,3 s | 199 km/h |
| Falke R4 | Allrad | 70.000 € | B 611 | A 730 | 4,1 s | 199 km/h |
| Luchs Kit Car | Front | 100.000 € | B 629 | A 779 | 4,1 s | 198 km/h |
| Wolf GT | Heck | 150.000 € | B 684 | A 799 | 3,5 s | 210 km/h |
| Adler WRC | Allrad | 220.000 € | A 740 | S1 853 | 3,4 s | 213 km/h |
| Panther Gruppe B | Allrad | 320.000 € | S1 828 | S2 912 | 2,9 s | 225 km/h |
| Drache Hybrid | Allrad | 450.000 € | S2 904 | S2 976 | 2,8 s | 237 km/h |

- **Tuning** pro Auto in 3 Stufen: Motor (+6 % Leistung je Stufe), Bremsen (+10 %), Fahrwerk (stabiler, −15 % Schaden je Stufe), Reifen (+3 % Grip)
- **Lackierungen** pro Auto: Werkslackierung gratis, dazu Mitternacht, Gletscher, Feuer und Schwarz-Gold

Tuning gilt in Meisterschaft und freier Fahrt. Bei der **Strecke der Woche** fahren alle mit den drei Basisautos Fuchs, Bison und Falke in Serie (alle drei verfügbar, kein Tuning), damit die Online-Rangliste fair bleibt. Im Koop sieht der Beifahrer die Lackierung des Fahrers. Preise und Wirkungen stehen in `src/profile.js`.

### Fahrzeug-Bewertung (PI und Klassen)

Jedes Auto hat einen **Performance-Index** von 100 bis 999 mit Klasse **D** (bis 500), **C** (501–600), **B** (601–700), **A** (701–800), **S1** (801–900), **S2** (901–998) und **X** (999). Der Index wird aus den Physikwerten berechnet (`src/ratings.js`):
- Kennzahlen: Höchstgeschwindigkeit (Übersetzung oder Luftwiderstand), 0–100 km/h (simuliert, abgeglichen mit `tools/gearbox-test.mjs`), Bremsweg 100–0 km/h (Bremse oder Reifengrip, je nachdem was zuerst begrenzt)
- sechs Werte von 0 bis 10: Tempo, Beschleunigung, Handling, Bremsen, Start, Robustheit

Die Werte aller Autos stehen in der Tabelle oben; `node tools/rating-calib.mjs` gibt sie neu aus. In der Garage zeigt jeder Tuning-Knopf, wie viel PI die nächste Stufe bringt. Die Bremsen-Stufen bringen 0 PI: die Autos bremsen schon stärker, als die Reifen übertragen können.

## Online-Rangliste: Strecke der Woche

Jede Kalenderwoche (ISO-Woche, UTC) gibt es eine feste Strecke für alle – Untergrund und Strecke ergeben sich aus der Woche. Im Menü unter **Woche** sieht man die Rangliste und startet die Fahrt; man darf beliebig oft fahren, es zählt die beste Zeit pro Name (inkl. Strafen). Nach dem Ziel Namen eingeben und „Zeit eintragen“.

Die Zeiten liegen in einer Supabase-Datenbank. Einrichtung:

1. Auf https://supabase.com ein kostenloses Projekt anlegen.
2. Im Dashboard unter **SQL Editor** den Inhalt von [`supabase/weekly.sql`](supabase/weekly.sql) ausführen. Das legt die Tabelle an und erlaubt über die öffentliche Schnittstelle nur: Zeiten der laufenden Woche eintragen und alle Zeiten lesen – nicht ändern, nicht löschen, keine alten Wochen.
3. Unter **Project Settings → API** die *Project URL* und den *anon public* Key kopieren und im GitHub-Repo als Secrets `SUPABASE_URL` und `SUPABASE_ANON_KEY` eintragen, danach den Pages-Workflow neu starten.
4. Lokal: eine Datei `.env.local` mit `VITE_SUPABASE_URL=…` und `VITE_SUPABASE_ANON_KEY=…` anlegen (wird nicht ins Repo übernommen).

Hinweis: Die Zeiten werden vom Browser gemeldet. Wer es darauf anlegt, kann eine falsche Zeit eintragen – die Datenbank prüft nur Plausibilität (30 s bis 60 min, gültiges Auto, nur aktuelle Woche).

## Koop spielen

1. Fahrer: im Menü unter „Koop“ „Raum erstellen“ – es erscheint ein 5-stelliger Code. Danach Meisterschaft oder freie Fahrt starten; der Raum bleibt über Etappenwechsel offen und der Beifahrer folgt automatisch.
2. Beifahrer (zweites Gerät): Code eingeben, „Beitreten“. Hat der Beifahrer eine andere Strecke geladen, wechselt er automatisch auf die des Fahrers.
3. Fahrer: „Etappe starten“. Der Fahrer sieht keinen Aufschrieb und hört keine Ansagen – der Beifahrer liest vor (am Tisch oder über Discord).

Der Beifahrer sieht vom Beifahrersitz aus mit großem Aufschrieb und „noch … m“ bis zur nächsten Ansage. Das Auto des Fahrers wird etwa 20× pro Sekunde übertragen und ~100 ms verzögert flüssig dargestellt.

Damit das zweite Gerät das Spiel überhaupt öffnen kann, muss es erreichbar sein:
- im selben WLAN: `npm run dev -- --host` und auf dem zweiten Gerät `http://<IP-des-PCs>:5173` öffnen
- über das Internet: https://nicronixs.github.io/Rally/ öffnen

Die Verbindung läuft direkt zwischen den beiden Browsern (WebRTC); der öffentliche PeerJS-Server vermittelt nur den Code. Viele Router und Mobilfunknetze blockieren direkte Verbindungen – dann hilft nur ein **TURN-Relay**. Dafür im GitHub-Repo unter *Settings → Secrets and variables → Actions* eintragen:

| Secret | Inhalt |
|---|---|
| `TURN_USERNAME` | Benutzername des TURN-Zugangs (z. B. von metered.ca) |
| `TURN_CREDENTIAL` | Passwort des TURN-Zugangs |
| `TURN_URLS` | optional, kommagetrennt; Standard sind die Metered-Server `global.relay.metered.ca` |

Danach den Workflow neu laufen lassen (Actions → GitHub Pages → Run workflow). Zum Ausprobieren ohne Build geht auch im Browser: `localStorage['rally.turn'] = '{"urls":["turn:…"],"username":"…","credential":"…"}'`.

## Steuerung

W/S Gas/Bremse · A/D Lenken · Leertaste Handbremse · Umschalt hochschalten · Strg runterschalten (1 → N → R) · G Automatik/manuell · F Vollbild · R zurück auf die Strecke · C Kamera (Cockpit, Verfolger, Motorhaube) · M Ton · B Aufschrieb · V Ansagen · Enter Neustart · N neue Strecke. **Controller** (Xbox, PlayStation u. a. mit Standard-Belegung): linker Stick lenken · RT Gas · LT Bremse · A Handbremse · RB/LB schalten · Y zurück auf die Strecke · View Kamera · Steuerkreuz ↑ Aufschrieb, ↓ Ansagen, ← Automatik/manuell, → Ton. In allen Menüs: Stick/Steuerkreuz wählen, A bestätigen, B zurück, Start = Weiter. Der Controller vibriert bei Aufprallen, abseits der Straße, auf Schotter und am Drehzahlbegrenzer.

**Schaltung:** Sequenzielles 6-Gang-Getriebe mit Drehzahlmesser und Schaltblitz (gelb ab 6500, rot blinkend am Begrenzer bei 7600 U/min). Standard ist manuell; G schaltet auf Automatik (dann wie früher: Bremse im Stand = rückwärts). Weil Strg+W im Browser den Tab schließt und eine Seite das nicht verhindern darf, am besten im Vollbild fahren (F) – dort sperrt das Spiel die Tastatur für sich.

## 3D-Modelle (Blender)

Auto, Bäume, Felsen, Kakteen und die Start-/Ziel-Tore werden mit Python-Skripten in Blender erzeugt und als glTF nach `public/models/` exportiert:

| Datei | Inhalt |
|---|---|
| `blender/car.py` | Karosserie aus 17 Querschnitten (gespiegelt, unterteilt, Radläufe per Boolean), Glas, Lichter, Lampenbalken, Flügel, Spiegel, Schmutzfänger, Innenraum mit Armaturenbrett, Schalensitzen, Überrollkäfig und Lenkrad, Fahrer und Beifahrer, Rad mit Bremsscheibe und Bremssattel |
| `blender/nature.py` | Tanne, verschneite Tanne, Laubbaum, Busch, Fels, Kaktus (Low-Poly, weil tausendfach instanziert) |
| `blender/gate.py` | Traversen-Tor mit Banner |
| `blender/build.py` | Baut alles und exportiert `car.glb`, `nature.glb`, `gate.glb`; mit `--preview` zusätzlich Vorschaubilder in `blender/previews/` |

Neu bauen (Blender ≥ 5 im PATH, sonst den vollen Pfad zu `blender.exe` verwenden):

```
npm run models -- car nature gate --preview
```

Das Spiel färbt die Materialien nach Namen ein (`Paint`, `Stripe`, `Accent`, `Rim` aus der Lackierung des Autos; Bäume und Felsen bekommen pro Exemplar einen Farbton) und blendet im Cockpit `Glass` und die eigene Figur aus.

## Texturen

Straßen- und Bodentexturen sind Fotos von [Poly Haven](https://polyhaven.com) (CC0): `rocky_trail` (Schotter), `asphalt_track`, `snow_02`, `dense_sand`, `aerial_grass_rock`. Sie liegen verkleinert in `public/textures/` (zusammen ca. 1,2 MB). Das Spiel färbt sie auf die Farben des jeweiligen Untergrunds um und legt auf der Straße Fahrspuren, Linien und weiche Ränder darüber. Welche Textur zu welchem Untergrund gehört, steht in `src/environments.js` (`textures`). Fehlen die Dateien, fällt das Spiel auf die einfache, selbst gezeichnete Optik zurück.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/track.js` | Erzeugt die Etappe aus einem Seed (Mittellinie pro Meter, Höhe, Kurvigkeit) |
| `src/terrain.js` | Gelände in 128-m-Blöcken, Mesh + Rapier-Heightfield |
| `src/road.js` | Schotterstraße, Wald, Start/Ziel/Split-Tore |
| `src/vehicle.js` | Fahrphysik (Raycast-Fahrzeug, Stabilitätshilfe, Schaden), `TUNING` zum Abstimmen |
| `src/cars.js` | Die acht Autos (Physikwerte und Lackierung; alle teilen sich ein Karosseriemodell) |
| `src/environments.js` | Untergründe: Aussehen, Gelände, Grip, Staub |
| `src/championship.js` | Rallyes, Gegner, Referenzzeiten, Punkte, Speicherstand |
| `src/screens.js` | Menü, Ergebnis-, Service- und Endbildschirm |
| `src/pacenotes.js` | Aufschrieb aus der Strecke: Richtung, Grad 1–6/Haarnadel, lang, zieht zu, macht auf, Kuppe, Achtung, Distanzen |
| `src/pacenoteUI.js` | Beifahrer-Buch (Anzeige) und Sprachansagen |
| `src/carModel.js` | Auto aus `car.glb` mit Lackierung, Rädern, Cockpit-Sicht und Schadensoptik |
| `src/models.js` | Lädt die glTF-Modelle, Umgebungs-Spiegelung für Lack und Glas |
| `src/effects.js`, `src/audio.js` | Staub, Motor- und Schottergeräusch |
| `src/net.js` | Koop-Verbindung (PeerJS/WebRTC): Raum-Code, Nachrichten, Herzschlag |
| `src/main.js` | Spielablauf, Kamera, HUD, Zeitmessung |
| `tools/gearbox-test.mjs` | Beschleunigung 0–100, Höchstgeschwindigkeit und Schaltpunkte je Auto |
| `tools/brake-test.mjs` | Bremsweg aus 100 km/h je Auto und Untergrund: `node tools/brake-test.mjs '{"brakeImpulse":90}'` |
| `tools/crash-test.mjs` | Schaden bei Aufprall mit verschiedenen Geschwindigkeiten |
| `tools/physics-test.mjs` | Fahrverhalten ohne Browser testen: `node tools/physics-test.mjs '{"rearGrip":0.9}'` |

## Fahrplan

1. ✅ Fahren: ein Auto, eine Schotteretappe, Zeitmessung
2. ✅ Aufschrieb (Pacenotes) automatisch aus der Strecke erzeugen, mit Anzeige und Sprachansagen
3. ✅ Online-Koop: Raum-Code, Beifahrer-Ansicht auf zweitem Gerät (PeerJS)
4. ✅ Meisterschaft: mehrere Länder/Untergründe, Autoauswahl, Schaden und Reparatur
