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

4 Rallyes (Nordwald/Schotter, Schneeland/Schnee, Alpenpass/Asphalt, Sandmeer/Wüste) mit je 3 Wertungsprüfungen gegen 7 fiktive Gegner. Nach jeder Rallye gibt es Punkte (25-18-15-12-10-8-6-4-2-1). Repariert wird nur zwischen den Rallyes: nach der letzten Prüfung einer Rallye gibt es 45 Minuten Service für Motor, Fahrwerk und Karosserie – was nicht repariert wird, bleibt. Zwischen den Prüfungen einer Rallye fährt man mit dem Schaden weiter. Kein Neustart; R (Bergung) kostet 5 s. Der Fortschritt wird im Browser gespeichert.

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

W/S Gas/Bremse · A/D Lenken · Leertaste Handbremse · R zurück auf die Strecke · C Kamera (Cockpit, Verfolger, Motorhaube) · M Ton · B Aufschrieb · V Ansagen · Enter Neustart · N neue Strecke. Gamepad: RT/LT, linker Stick, A Handbremse, Y Zurücksetzen.

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
| `tools/brake-test.mjs` | Bremsweg aus 100 km/h je Auto und Untergrund: `node tools/brake-test.mjs '{"brakeImpulse":90}'` |
| `tools/crash-test.mjs` | Schaden bei Aufprall mit verschiedenen Geschwindigkeiten |
| `tools/physics-test.mjs` | Fahrverhalten ohne Browser testen: `node tools/physics-test.mjs '{"rearGrip":0.9}'` |

## Fahrplan

1. ✅ Fahren: ein Auto, eine Schotteretappe, Zeitmessung
2. ✅ Aufschrieb (Pacenotes) automatisch aus der Strecke erzeugen, mit Anzeige und Sprachansagen
3. ✅ Online-Koop: Raum-Code, Beifahrer-Ansicht auf zweitem Gerät (PeerJS)
4. ✅ Meisterschaft: mehrere Länder/Untergründe, Autoauswahl, Schaden und Reparatur
