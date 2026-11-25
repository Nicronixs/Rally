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

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/track.js` | Erzeugt die Etappe aus einem Seed (Mittellinie pro Meter, Höhe, Kurvigkeit) |
| `src/terrain.js` | Gelände in 128-m-Blöcken, Mesh + Rapier-Heightfield |
| `src/road.js` | Schotterstraße, Wald, Start/Ziel/Split-Tore |
| `src/vehicle.js` | Fahrphysik (Raycast-Fahrzeug, Stabilitätshilfe, Schaden), `TUNING` zum Abstimmen |
| `src/cars.js` | Die drei Autos (Falke R4 Allrad, Fuchs R2 Front, Bison Klassik Heck) |
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
